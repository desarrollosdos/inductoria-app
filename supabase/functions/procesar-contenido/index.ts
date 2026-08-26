// Inductoria · Edge Function: procesar-contenido
// ------------------------------------------------
// El dueño aprieta "Generar curso con IA" sobre un contenido puntual.
// Esto le manda el texto a Claude (Haiku, el modelo más barato), le pide
// que lo convierta en pasos desarrollados + preguntas de opción múltiple,
// y crea un microcurso en estado "pendiente" (borrador, el dueño todavía
// tiene que revisarlo y aprobarlo antes de que lo vea un empleado).
//
// Se dispara a mano por diseño, nunca automático, para que el costo de
// la IA quede bajo control del dueño, no corriendo solo en segundo plano.
//
// 2026-08-26, REDISEÑO (tercera vuelta): Roberto reportó, probando desde
// el celular, que a veces esperaba bastante y la pantalla volvía a
// Contenido sin generar nada y sin error. Con logs de checkpoint se
// confirmó que la conexión se corta de verdad del lado del cliente
// mientras el trabajo seguía en curso. La vuelta anterior (timeout +
// abort acá adentro) no resolvía esto: el problema no era que la función
// tardara demasiado, era que el CLIENTE (el celular) dejaba de estar
// conectado para recibir la respuesta, sin importar cuánto tardara la
// función.
//
// Rediseño: esta función ahora NO espera a que termine la IA para
// responder. Hace las validaciones (rápidas), marca el contenido como
// "generando", y responde de inmediato. El trabajo pesado (llamar a
// Claude, guardar el curso) sigue corriendo en el servidor con
// EdgeRuntime.waitUntil(), completamente independiente de si el cliente
// sigue conectado o no. El frontend (Contenido.jsx) ya no espera esta
// respuesta larga: solo pregunta cada pocos segundos si terminó,
// consultando el estado del contenido en la base. Así, aunque el celular
// pierda la conexión, cierre la app o recargue la página, el trabajo en
// el servidor sigue solo y el resultado queda guardado igual.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { puedeUsarIA, MENSAJE_IA_BLOQUEADA_TRIAL } from '../_shared/acceso.ts';
import { AVISO_MATERIAL_NO_CONFIABLE, envolverMaterialNoConfiable, validarCursoGenerado } from '../_shared/prompt-seguridad.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Margen amplio para la llamada a Claude en segundo plano. Como ya no
// depende de que el cliente siga conectado, este límite es solo para no
// dejar un proceso colgado para siempre si la API de Claude no responde
// nunca — no para "llegar a tiempo" antes de que alguien se harte de
// esperar en pantalla.
const TIMEOUT_CLAUDE_MS = 170_000;

function construirInstrucciones() {
  return `${AVISO_MATERIAL_NO_CONFIABLE}

Convertí el material de capacitación de un comercio que te van a pasar en un curso completo y serio para un empleado nuevo, con el mismo nivel de profundidad y formato que usaría una plataforma de capacitación profesional (no un resumen ni un apunte rápido).

Estructura obligatoria, siempre 5 pasos, en este orden:
1. Marco y por qué importa: contexto de por qué este tema es relevante para el puesto (si el material menciona una norma, ley o estándar, citala acá con precisión; si no menciona ninguna, explicá el motivo práctico/de negocio).
2 a 4. Desarrollo práctico: el contenido concreto dividido en 3 pasos temáticos coherentes (por ejemplo, separado por proceso, por situación, o por tipo de tarea, según lo que tenga sentido para el material).
5. Qué hacer ante problemas o casos límite, y cierre: qué hacer cuando algo sale mal o hay dudas, y una idea final que resuma el punto central del curso.

Reglas de contenido:
- Cada uno de los 5 pasos tiene que tener entre 200 y 280 palabras. No menos. Esto no es negociable: un paso de 3 líneas no sirve para capacitar a nadie.
- Desarrollá el POR QUÉ de cada cosa, no solo el QUÉ. Sumá contexto y al menos un ejemplo concreto o situación típica del día a día del comercio en cada paso donde ayude a entender mejor.
- Si dentro de un paso hay una lista de reglas, pasos a seguir, o ítems puntuales (cosas que sí hacer, cosas que no hacer, checklist), escribilos como líneas separadas por salto de línea, cada una arrancando con un guión "-". Si en cambio es una explicación conceptual corrida, escribila como párrafo normal, sin guiones. Podés combinar: un párrafo de contexto seguido de una lista con guiones dentro del mismo paso.
- Tono serio y profesional, pero en segunda persona ("vos"), tono argentino, sin sonar acartonado ni como un trámite burocrático, como si un compañero con experiencia real le explicara el tema a alguien que recién arranca.
- Exactamente 5 preguntas de opción múltiple (3 opciones cada una), una por cada paso, que evalúen el punto central de ESE paso puntual, no detalles menores ni trivia.
- No inventes información que no esté en el material original. Si el material es corto, desarrollá y explicá mejor lo que SÍ está (con más contexto, ejemplos y aplicación práctica), pero no agregues datos, cifras o normas que no estén en el original.

Respondé ÚNICAMENTE con un JSON válido, sin texto antes ni después, con esta forma exacta:
{
  "titulo": "string corto para el curso",
  "duracion_min": número estimado de minutos de lectura,
  "pasos": [{"titulo": "string", "contenido": "string"}],
  "preguntas": [{"pregunta": "string", "opciones": ["string","string","string"], "correcta": índice 0/1/2 de la correcta}]
}`;
}

// Todo el trabajo pesado, corre en segundo plano DESPUÉS de que la
// función ya respondió. Cualquier error acá adentro se guarda en
// contenidos.error_generacion y el contenido vuelve a "aprobado", para
// que el frontend (consultando periódicamente) lo vea y se lo muestre al
// dueño con un mensaje entendible.
async function generarEnSegundoPlano(supabase: any, contenido: any, contenidoId: string, anthropicKey: string) {
  async function marcarError(mensaje: string, detalle?: unknown) {
    if (detalle !== undefined) console.error('procesar-contenido (background):', mensaje, { contenidoId }, detalle);
    else console.error('procesar-contenido (background):', mensaje, { contenidoId });
    await supabase
      .from('contenidos')
      .update({ estado: 'aprobado', error_generacion: mensaje })
      .eq('id', contenidoId);
  }

  try {
    const materialLength = (contenido.texto_procesado || '').length;
    console.log('procesar-contenido (background): llamando a Claude', { contenidoId, materialLength });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_CLAUDE_MS);

    let claudeRes: Response;
    try {
      claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          system: construirInstrucciones(),
          messages: [{ role: 'user', content: envolverMaterialNoConfiable(contenido.texto_procesado) }],
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        await marcarError('La IA tardó demasiado en responder. Probá de nuevo — si el contenido es muy largo, puede ayudar dividirlo en partes más cortas.');
        return;
      }
      await marcarError('No se pudo conectar con la IA. Probá de nuevo.', fetchErr);
      return;
    }
    clearTimeout(timeoutId);
    console.log('procesar-contenido (background): Claude respondió', { contenidoId, status: claudeRes.status });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      await marcarError('No se pudo generar el curso.', errText);
      return;
    }

    const claudeData = await claudeRes.json();
    const textoRespuesta = claudeData.content?.[0]?.text || '';

    // Costo real según tokens que devuelve la propia API (no una estimación).
    // Precios de Claude Haiku 4.5: USD 1.00 / millón de tokens de entrada,
    // USD 5.00 / millón de tokens de salida.
    const usage = claudeData.usage || {};
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const costoUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

    const { error: usageError } = await supabase.from('ai_usage_log').insert({
      cuenta_id: contenido.cuenta_id,
      contenido_id: contenidoId,
      model: 'claude-haiku-4-5-20251001',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      costo_usd: costoUsd,
    });
    if (usageError) console.error('No se pudo registrar el costo de IA:', usageError);

    // Por si Claude envuelve el JSON en ```json ... ``` a pesar de que se lo pedimos limpio.
    const jsonLimpio = textoRespuesta.replace(/```json|```/g, '').trim();

    let cursoGenerado;
    try {
      cursoGenerado = JSON.parse(jsonLimpio);
    } catch (e) {
      await marcarError('La IA devolvió una respuesta inválida. Probá de nuevo.', textoRespuesta);
      return;
    }

    // Validamos que el JSON tenga exactamente la forma que pedimos antes
    // de guardar nada. Además de ser una buena práctica en general, esto
    // es la última barrera contra una inyección de instrucciones metida
    // en el material (ver AVISO_MATERIAL_NO_CONFIABLE más arriba): si algo
    // logró desviar parcialmente al modelo, lo más probable es que el
    // resultado no tenga esta forma exacta, y acá lo cortamos antes de
    // que llegue a convertirse en un curso real.
    const errorValidacion = validarCursoGenerado(cursoGenerado);
    if (errorValidacion) {
      await marcarError('La IA devolvió un curso con un formato inesperado. Probá de nuevo.', { errorValidacion, textoRespuesta });
      return;
    }

    // Creamos el microcurso como BORRADOR (pendiente), el dueño lo revisa
    // y recién ahí lo aprueba desde la pantalla de Contenido.
    const { data: microcurso, error: microcursoError } = await supabase
      .from('microcursos')
      .insert({
        cuenta_id: contenido.cuenta_id,
        titulo: cursoGenerado.titulo,
        duracion_min: cursoGenerado.duracion_min || null,
        estado: 'pendiente',
        preguntas: cursoGenerado.preguntas || [],
      })
      .select()
      .single();

    if (microcursoError) {
      await marcarError('No se pudo guardar el curso generado. Probá de nuevo.', microcursoError);
      return;
    }

    const pasosAInsertar = (cursoGenerado.pasos || []).map((p: any, i: number) => ({
      microcurso_id: microcurso.id,
      orden: i + 1,
      titulo: p.titulo,
      contenido: p.contenido,
    }));

    if (pasosAInsertar.length > 0) {
      const { error: pasosError } = await supabase.from('pasos').insert(pasosAInsertar);
      if (pasosError) {
        await marcarError('No se pudo guardar el contenido del curso. Probá de nuevo.', pasosError);
        return;
      }
    }

    // Marcamos el contenido como procesado, y lo vinculamos al curso generado.
    await supabase
      .from('contenidos')
      .update({ estado: 'procesado', microcurso_id: microcurso.id, error_generacion: null })
      .eq('id', contenidoId);

    console.log('procesar-contenido (background): completado OK', { contenidoId, microcursoId: microcurso.id });
  } catch (err) {
    await marcarError('Error inesperado al generar el curso. Probá de nuevo.', err);
  }
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
    const contenidoId = body.contenido_id;
    console.log('procesar-contenido: inicio', { contenidoId, userId: user.id });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Traemos el contenido, y confirmamos que sea de una cuenta del usuario que llama.
    const { data: contenido, error: contenidoError } = await supabase
      .from('contenidos')
      .select('*, cuentas!inner(owner_id, plan, trial_ends_at)')
      .eq('id', contenidoId)
      .single();

    if (contenidoError || !contenido || contenido.cuentas.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Contenido no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generar con IA no está disponible en trial, aunque el resto de la
    // app sí. Se valida acá (no solo en el frontend) porque cualquiera
    // podría llamar esta función directo con el token del usuario.
    if (!puedeUsarIA(contenido.cuentas, user.email)) {
      return new Response(JSON.stringify({ error: MENSAJE_IA_BLOQUEADA_TRIAL }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (contenido.estado !== 'aprobado') {
      return new Response(
        JSON.stringify({ error: 'Marcá el contenido como aprobado antes de generar el curso' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;

    // Marcamos como "generando" YA, antes de responder. A partir de acá
    // el frontend deja de mantener esta conexión abierta: solo va a
    // preguntar el estado cada pocos segundos.
    const { error: marcarGenerandoError } = await supabase
      .from('contenidos')
      .update({ estado: 'generando', error_generacion: null })
      .eq('id', contenidoId);

    if (marcarGenerandoError) {
      console.error('procesar-contenido: no se pudo marcar como generando', { contenidoId }, marcarGenerandoError);
      // 2026-08-26: antes esto devolvía un mensaje genérico sin ningún
      // detalle, así que cuando falló (muy probablemente por una
      // restricción de base de datos que todavía no permitía el valor
      // 'generando' en contenidos.estado) no había forma de saber la
      // causa real sin ir a buscar los logs de Supabase a mano. Ahora se
      // manda el motivo exacto que devuelve Postgres/PostgREST.
      return new Response(
        JSON.stringify({
          error: 'No se pudo iniciar la generación. Probá de nuevo.',
          detalle: marcarGenerandoError.message || String(marcarGenerandoError),
          codigo: marcarGenerandoError.code,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const trabajo = generarEnSegundoPlano(supabase, contenido, contenidoId, anthropicKey);

    // EdgeRuntime.waitUntil deja que el trabajo siga corriendo después de
    // que ya respondimos, sin bloquear al cliente. Si por algún motivo no
    // estuviera disponible (no debería pasar en el runtime de Supabase),
    // esperamos igual como respaldo, para no perder el trabajo — en ese
    // caso puntual se pierde el beneficio de responder rápido, pero la
    // función sigue funcionando.
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt && typeof rt.waitUntil === 'function') {
      rt.waitUntil(trabajo);
    } else {
      await trabajo;
    }

    return new Response(JSON.stringify({ generando: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('procesar-contenido: error inesperado', err);
    return new Response(JSON.stringify({ error: 'Error inesperado', detalle: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
