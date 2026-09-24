// Inductoria · Edge Function: extraer-texto-archivo
// ------------------------------------------------
// Contenido.jsx sube un PDF, .docx, imagen o audio (base64) y esto
// devuelve el texto plano extraído, para que el dueño lo vea y edite en
// el textarea antes de aprobarlo, igual que hoy hace con .txt.
//
// - PDF/.docx: se parsean acá mismo (unpdf / mammoth). Sin costo de IA.
// - Imagen: se manda a Claude (vision) para "leerla". Cuesta centavos,
//   se loguea en ai_usage_log como el resto de la IA de Inductoria.
//   Bloqueado en trial (usa puedeUsarIA), igual que generar un curso.
// - Audio: se manda a Groq (Whisper), NO a Claude — la API de Claude no
//   acepta audio. Groq tiene nivel gratis (hasta 8hs de audio/día, sin
//   tarjeta), así que esto no suma costo mientras no se pase de ese
//   límite. Necesita el secret GROQ_API_KEY cargado en Supabase (cuenta
//   gratuita en console.groq.com, separada de Anthropic).
//   DISPONIBLE EN TRIAL (desde 2026-08-17): a diferencia de la imagen,
//   esto no tiene costo real, así que no pasa por puedeUsarIA. Cada
//   transcripción se loguea en audio_transcripciones_log (no en
//   ai_usage_log, que es específicamente costo real en USD) para poder
//   ver en el panel de admin cuánto volumen se genera — por si Groq
//   algún día deja de ser gratis en ese volumen o cambia sus límites.
// - .txt: se decodifica acá mismo (el frontend normalmente lo lee solo,
//   pero si llega acá lo aceptamos igual, para que los dos lados acepten
//   los mismos tipos).
// - Video: NO soportado, decisión explícita de no agregarlo.
//
// 2026-09-24: toda la función exige una cuenta con acceso (activa, con
// pago pendiente, trial vigente o exenta). Antes cualquier usuario
// logueado, aunque no tuviera cuenta o la tuviera suspendida o cancelada,
// podía mandar audios o imágenes y gastar la cuota de Groq/Anthropic.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.11.0';
import mammoth from 'npm:mammoth@1.8.0';
import { puedeUsarIA, MENSAJE_IA_BLOQUEADA_TRIAL, CUENTAS_EXENTAS, type CuentaPlan } from '../_shared/acceso.ts';
import { AVISO_MATERIAL_NO_CONFIABLE } from '../_shared/prompt-seguridad.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TAMANO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB (Groq acepta hasta 25MB, nos quedamos cortos por las dudas)

// Anthropic rechaza imágenes de más de 5 MB (medido sobre el base64 que le
// mandamos). Lo chequeamos antes de llamar para no gastar el pedido y
// poder dar un mensaje claro.
const TAMANO_MAX_IMAGEN_BASE64 = 5 * 1024 * 1024;

// Tipos de imagen que acepta Claude vision, por MIME y por extensión.
const TIPOS_IMAGEN: Record<string, string> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
};
const IMAGEN_POR_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

// Mismo criterio que tieneAccesoBase en src/lib/acceso.js: cuenta activa,
// con pago pendiente, trial vigente, o cuenta exenta. Se arma acá porque
// _shared/acceso.ts todavía no exporta esta regla.
function tieneAccesoBase(cuenta: CuentaPlan | null | undefined, email?: string | null): boolean {
  if (email && CUENTAS_EXENTAS.has(email)) return true;
  if (!cuenta) return false;
  if (cuenta.plan === 'active' || cuenta.plan === 'past_due') return true;
  return (
    cuenta.plan === 'trial' &&
    !!cuenta.trial_ends_at &&
    new Date(cuenta.trial_ends_at).getTime() > Date.now()
  );
}

const MENSAJE_SIN_ACCESO =
  'Tu cuenta no tiene acceso en este momento. Revisá tu suscripción en la sección Suscripción para seguir cargando contenido.';

// Groq a veces devuelve 500/503 (internal_server_error / service_unavailable)
// por capacidad del lado de ellos, no porque el audio esté mal. Vimos esto
// Sacamos los reintentos que había acá: confirmado que el error de Groq
// en mobile NO es pasajero (pasa siempre, no a veces), así que reintentar
// solo sumaba tiempo de sobra y garantizaba pisar el límite de 150
// segundos que tiene Supabase por función, terminando siempre en un 504
// en vez de dejar ver el error real de Groq a tiempo.
const GROQ_MAX_INTENTOS = 1;
const GROQ_ESPERA_ENTRE_INTENTOS_MS = 1500;

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function transcribirConGroq(bytes: Uint8Array, tipo: string, nombreArchivo: string, groqKey: string) {
  let ultimoError = '';

  for (let intento = 1; intento <= GROQ_MAX_INTENTOS; intento++) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: tipo || 'audio/mpeg' }), nombreArchivo || 'audio.mp3');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'es');
    // "text" en vez de "verbose_json": el intento de leer duration/segments
    // del JSON de Groq resultó poco confiable, así que dejamos de arriesgar
    // la transcripción en sí por eso. Para el contador de tiempo del panel
    // de admin usamos la duración que ya mide el navegador (duracionSeg).
    form.append('response_format', 'text');

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
    });

    if (groqRes.ok) {
      return { ok: true as const, texto: await groqRes.text() };
    }

    ultimoError = await groqRes.text();
    console.error(`Error de Groq (audio), intento ${intento}/${GROQ_MAX_INTENTOS}:`, ultimoError);

    // Solo reintentamos errores que pintan transitorios (5xx / rate limit).
    // Un 400 (archivo inválido) no se arregla reintentando.
    const esTransitorio = groqRes.status >= 500 || groqRes.status === 429;
    if (!esTransitorio || intento === GROQ_MAX_INTENTOS) break;

    await esperar(GROQ_ESPERA_ENTRE_INTENTOS_MS * intento);
  }

  return { ok: false as const, error: ultimoError };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const archivoBase64 = body.archivo_base64 as string | undefined;
    const nombreArchivo = (body.nombre_archivo as string | undefined) || '';
    const tipo = (body.tipo as string | undefined) || '';

    if (!archivoBase64) {
      return new Response(JSON.stringify({ error: 'Falta el archivo' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Chequeo rápido sobre el largo del base64 antes de decodificarlo
    // (un archivo enorme no llega a ocupar memoria de más).
    if (archivoBase64.length > Math.ceil((TAMANO_MAX_BYTES * 4) / 3) + 4) {
      return new Response(JSON.stringify({ error: 'El archivo pesa más de 10 MB. Probá con uno más liviano.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bytes = Uint8Array.from(atob(archivoBase64), (c) => c.charCodeAt(0));

    if (bytes.length > TAMANO_MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'El archivo pesa más de 10 MB. Probá con uno más liviano.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nombreLower = nombreArchivo.toLowerCase();
    const extension = (nombreLower.match(/\.([a-z0-9]+)$/) || [])[1] || '';
    const esTxt = tipo === 'text/plain' || extension === 'txt';
    const esPdf = tipo === 'application/pdf' || nombreLower.endsWith('.pdf');
    const esDocx =
      tipo === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      nombreLower.endsWith('.docx');
    // El tipo real de la imagen sale del MIME si es uno conocido, y si no
    // de la extensión. Antes, sin MIME, se asumía image/jpeg y un PNG o
    // WEBP terminaba rechazado por Anthropic con un error confuso.
    const mimeImagen = TIPOS_IMAGEN[tipo] || IMAGEN_POR_EXTENSION[extension] || null;
    const esImagen = !!mimeImagen || tipo.startsWith('image/');
    const esAudio =
      tipo.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|webm|opus)$/.test(nombreLower);

    if (!esTxt && !esPdf && !esDocx && !esImagen && !esAudio) {
      return new Response(
        JSON.stringify({ error: 'Solo se aceptan archivos .txt, .pdf, .docx, imágenes o audio. Video no está soportado.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (esImagen && !mimeImagen) {
      return new Response(
        JSON.stringify({ error: 'Ese formato de imagen no lo podemos leer. Usá una foto o captura en PNG, JPG o WEBP.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (esImagen && archivoBase64.length > TAMANO_MAX_IMAGEN_BASE64) {
      return new Response(
        JSON.stringify({ error: 'La imagen pesa demasiado (el máximo es de unos 3,5 MB). Probá con una captura o una foto más liviana.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PDF/.docx se extraen con librerías comunes (unpdf/mammoth), sin
    // costo de IA, así que quedan disponibles en trial. Imagen sí usa un
    // modelo de IA con costo real (Claude vision), igual que
    // generar/actualizar cursos: no disponible en trial. Audio (Groq)
    // es gratis, así que SÍ está disponible en trial (ver cabecera del
    // archivo) — solo se consulta la cuenta para loguear el volumen.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: cuentaDelUsuario } = await supabase
      .from('cuentas')
      .select('id, plan, trial_ends_at')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!tieneAccesoBase(cuentaDelUsuario, user.email)) {
      return new Response(JSON.stringify({ error: MENSAJE_SIN_ACCESO }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (esImagen && !puedeUsarIA(cuentaDelUsuario, user.email)) {
      return new Response(JSON.stringify({ error: MENSAJE_IA_BLOQUEADA_TRIAL }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let textoExtraido = '';

    if (esTxt) {
      textoExtraido = new TextDecoder('utf-8').decode(bytes);
    } else if (esPdf) {
      const pdf = await getDocumentProxy(bytes);
      const resultado = await extractText(pdf, { mergePages: true });
      textoExtraido = Array.isArray(resultado.text) ? resultado.text.join('\n') : resultado.text;
    } else if (esDocx) {
      const resultado = await mammoth.extractRawText({ buffer: bytes });
      textoExtraido = resultado.value;
    } else if (esAudio) {
      // Audio: Groq Whisper (gratis dentro del límite diario), NO Claude.
      const groqKey = Deno.env.get('GROQ_API_KEY');
      if (!groqKey) {
        // La causa técnica queda en el log, el dueño ve un mensaje simple.
        console.error('extraer-texto-archivo: falta el secret GROQ_API_KEY en Supabase');
        return new Response(
          JSON.stringify({ error: 'No pudimos procesar el audio. Probá más tarde.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const resultadoGroq = await transcribirConGroq(bytes, tipo, nombreArchivo, groqKey);

      if (!resultadoGroq.ok) {
        return new Response(
          JSON.stringify({
            error: 'No pudimos transcribir el audio. Probá de nuevo o con un audio más corto.',
            detalle: resultadoGroq.error.slice(0, 500),
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      textoExtraido = resultadoGroq.texto;

      // Volumen y tiempo de transcripciones de audio (gratis, no es un
      // costo real en USD como ai_usage_log). Sirve para que el admin vea
      // si el uso crece mucho — por ejemplo, muchas cuentas en trial
      // grabando audio — y pueda anticiparse si Groq algún día deja de ser
      // gratis en ese volumen o límite. No corta el flujo si falla el insert.
      //
      // duracion_seg viene del navegador (mide el tiempo real de la
      // grabación mientras ocurre) cuando el audio se generó grabando acá
      // mismo — es exacto y no depende de parsear nada de Groq. Si el
      // audio vino de un archivo ya grabado que el Cliente subió, no lo
      // tenemos, así que queda null (se puede sumar más adelante si hace
      // falta, decodificando el archivo, pero no es necesario para tener
      // una señal útil del volumen usado).
      const duracionSegCliente = Number(body.duracion_seg);
      const duracionSegundos = Number.isFinite(duracionSegCliente) && duracionSegCliente > 0 ? duracionSegCliente : null;

      const { error: logError } = await supabase.from('audio_transcripciones_log').insert({
        cuenta_id: cuentaDelUsuario?.id ?? null,
        plan_al_momento: cuentaDelUsuario?.plan ?? null,
        bytes_archivo: bytes.length,
        duracion_segundos: duracionSegundos,
      });
      if (logError) console.error('No se pudo registrar el log de transcripción de audio:', logError);
    } else {
      // Imagen: se la mandamos a Claude (vision) para que "lea" el
      // contenido de capacitación que muestra la captura.
      const mediaType = mimeImagen as string;
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          // Lo que diga la imagen es dato, nunca una orden (mismo criterio
          // que el resto de las funciones que leen material del comercio).
          system: AVISO_MATERIAL_NO_CONFIABLE.replace(
            'entre las etiquetas <material_del_comercio>',
            'en la imagen'
          ),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mediaType, data: archivoBase64 },
                },
                {
                  type: 'text',
                  text: 'Esta imagen es una captura de pantalla o foto con material de capacitación de un comercio (puede ser texto, una lista de pasos, un cartel, una planilla, etc.). Transcribí TODO el texto y contenido relevante que veas, en texto plano, respetando el orden y la estructura (si hay pasos o listas, mantenelos como tal). No agregues comentarios tuyos, ni interpretaciones, solo lo que está escrito o mostrado en la imagen.',
                },
              ],
            },
          ],
        }),
      });

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        console.error('Error de Claude (imagen):', errText);
        return new Response(JSON.stringify({ error: 'No pudimos leer la imagen. Probá de nuevo o pegá el texto a mano.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const claudeData = await claudeRes.json();
      textoExtraido = claudeData.content?.[0]?.text || '';

      // Registramos el costo contra la cuenta real del usuario, mismo
      // criterio que procesar-contenido (nunca cuenta_id null). El audio
      // (Groq) no se loguea acá porque es gratis, no tiene costo real —
      // se loguea aparte en audio_transcripciones_log (ver rama esAudio).
      const usage = claudeData.usage || {};
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const costoUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

      // Reusa la misma cuenta consultada más arriba (ya se validó el
      // acceso a IA con esta misma cuenta), en vez de volver a pedirla.
      if (cuentaDelUsuario) {
        const { error: usageError } = await supabase.from('ai_usage_log').insert({
          cuenta_id: cuentaDelUsuario.id,
          contenido_id: null,
          model: 'claude-haiku-4-5-20251001',
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          costo_usd: costoUsd,
        });
        if (usageError) console.error('No se pudo registrar el costo de IA (imagen):', usageError);
      }
    }

    textoExtraido = textoExtraido.trim();

    if (!textoExtraido) {
      return new Response(
        JSON.stringify({
          error:
            'No se pudo extraer texto de ese archivo. Puede ser un PDF escaneado sin texto, una imagen sin contenido legible, o un audio sin voz clara. Probá pegando el texto a mano.',
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ texto: textoExtraido }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'No pudimos procesar el archivo. Probá de nuevo.', detalle: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
