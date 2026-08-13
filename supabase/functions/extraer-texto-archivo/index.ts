// Inductoria · Edge Function: extraer-texto-archivo
// ------------------------------------------------
// Contenido.jsx sube un PDF, .docx, imagen o audio (base64) y esto
// devuelve el texto plano extraído, para que el dueño lo vea y edite en
// el textarea antes de aprobarlo, igual que hoy hace con .txt.
//
// - PDF/.docx: se parsean acá mismo (unpdf / mammoth).
// - Imagen: se manda a Claude (vision) para "leerla". Cuesta centavos,
//   se loguea en ai_usage_log como el resto de la IA de Inductoria.
// - Audio: se manda a Groq (Whisper), NO a Claude — la API de Claude no
//   acepta audio. Groq tiene nivel gratis (hasta 8hs de audio/día, sin
//   tarjeta), así que esto no suma costo mientras no se pase de ese
//   límite. Necesita el secret GROQ_API_KEY cargado en Supabase (cuenta
//   gratuita en console.groq.com, separada de Anthropic).
// - Video: NO soportado, decisión explícita de no agregarlo.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.11.0';
import mammoth from 'npm:mammoth@1.8.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TAMANO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB (Groq acepta hasta 25MB, nos quedamos cortos por las dudas)

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

    const bytes = Uint8Array.from(atob(archivoBase64), (c) => c.charCodeAt(0));

    if (bytes.length > TAMANO_MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'El archivo pesa más de 10 MB' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nombreLower = nombreArchivo.toLowerCase();
    const esPdf = tipo === 'application/pdf' || nombreLower.endsWith('.pdf');
    const esDocx =
      tipo === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      nombreLower.endsWith('.docx');
    const tiposImagen: Record<string, string> = {
      'image/png': 'image/png',
      'image/jpeg': 'image/jpeg',
      'image/jpg': 'image/jpeg',
      'image/webp': 'image/webp',
    };
    const esImagen =
      Object.keys(tiposImagen).includes(tipo) ||
      /\.(png|jpe?g|webp)$/.test(nombreLower);
    const esAudio =
      tipo.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|webm|opus)$/.test(nombreLower);

    if (!esPdf && !esDocx && !esImagen && !esAudio) {
      return new Response(
        JSON.stringify({ error: 'Solo se aceptan PDF, .docx, imágenes o audio. Video no está soportado.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let textoExtraido = '';

    if (esPdf) {
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
        return new Response(
          JSON.stringify({
            error: 'Falta configurar la transcripción de audio (GROQ_API_KEY no está cargada en Supabase).',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const form = new FormData();
      form.append('file', new Blob([bytes], { type: tipo || 'audio/mpeg' }), nombreArchivo || 'audio.mp3');
      form.append('model', 'whisper-large-v3-turbo');
      form.append('language', 'es');
      form.append('response_format', 'text');

      const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: form,
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        console.error('Error de Groq (audio):', errText);
        return new Response(JSON.stringify({ error: 'No se pudo transcribir el audio' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      textoExtraido = await groqRes.text();
    } else {
      // Imagen: se la mandamos a Claude (vision) para que "lea" el
      // contenido de capacitación que muestra la captura.
      const mediaType = tiposImagen[tipo] || 'image/jpeg';
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
        return new Response(JSON.stringify({ error: 'No se pudo leer el contenido de la imagen' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const claudeData = await claudeRes.json();
      textoExtraido = claudeData.content?.[0]?.text || '';

      // Registramos el costo contra la cuenta real del usuario, mismo
      // criterio que procesar-contenido (nunca cuenta_id null). El audio
      // (Groq) no se loguea acá porque es gratis, no tiene costo real.
      const usage = claudeData.usage || {};
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const costoUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      const { data: cuentaDelUsuario } = await supabase
        .from('cuentas')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle();

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
    return new Response(JSON.stringify({ error: 'No se pudo procesar el archivo', detalle: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
