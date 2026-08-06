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

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Traemos el contenido, y confirmamos que sea de una cuenta del usuario que llama.
    const { data: contenido, error: contenidoError } = await supabase
      .from('contenidos')
      .select('*, cuentas!inner(owner_id)')
      .eq('id', contenidoId)
      .single();

    if (contenidoError || !contenido || contenido.cuentas.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Contenido no encontrado' }), {
        status: 404,
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

    const prompt = `Convertí el siguiente material de capacitación de un comercio en un microcurso desarrollado para un empleado nuevo. Tiene que quedar completo y útil por sí solo, no un resumen apurado: alguien que lea solo esto tiene que entender el tema a fondo, sin necesidad de preguntar nada más.

Reglas:
- Entre 3 y 5 pasos, cada uno con un título corto.
- Cada paso tiene que tener entre 180 y 280 palabras (no menos). Desarrollá bien cada idea: explicá el POR QUÉ de cada cosa, no solo el QUÉ, y sumá al menos un ejemplo concreto o una situación típica del día a día del comercio cuando ayude a entender mejor.
- Si dentro de un paso hay una lista de reglas, pasos a seguir, o ítems puntuales (por ejemplo: cosas que sí hacer, cosas que no hacer, checklist de apertura), escribilos como líneas separadas por salto de línea, cada una arrancando con un guión "-". Si en cambio es una explicación conceptual corrida, escribila como párrafo normal, sin guiones.
- El texto tiene que ser claro, directo, en segunda persona ("vos"), tono argentino, como si un compañero con experiencia se lo explicara a el que recién arranca.
- 3 a 5 preguntas de opción múltiple (3 opciones cada una) que evalúen los puntos clave de los pasos, no detalles menores.
- No inventes información que no esté en el material original. Si el material es corto, desarrollá y explicá mejor lo que SÍ está (con más contexto, ejemplos y aplicación práctica), pero no agregues datos, cifras o normas que no estén en el original.

Material original:
"""
${contenido.texto_procesado}
"""

Respondé ÚNICAMENTE con un JSON válido, sin texto antes ni después, con esta forma exacta:
{
  "titulo": "string corto para el curso",
  "duracion_min": número estimado de minutos de lectura,
  "pasos": [{"titulo": "string", "contenido": "string"}],
  "preguntas": [{"pregunta": "string", "opciones": ["string","string","string"], "correcta": índice 0/1/2 de la correcta}]
}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Error de Claude:', errText);
      return new Response(JSON.stringify({ error: 'No se pudo generar el curso' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      console.error('No se pudo parsear la respuesta de Claude:', textoRespuesta);
      return new Response(JSON.stringify({ error: 'La IA devolvió una respuesta inválida' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    if (microcursoError) throw microcursoError;

    const pasosAInsertar = (cursoGenerado.pasos || []).map((p: any, i: number) => ({
      microcurso_id: microcurso.id,
      orden: i + 1,
      titulo: p.titulo,
      contenido: p.contenido,
    }));

    if (pasosAInsertar.length > 0) {
      const { error: pasosError } = await supabase.from('pasos').insert(pasosAInsertar);
      if (pasosError) throw pasosError;
    }

    // Marcamos el contenido como procesado, y lo vinculamos al curso generado.
    await supabase
      .from('contenidos')
      .update({ estado: 'procesado', microcurso_id: microcurso.id })
      .eq('id', contenidoId);

    return new Response(JSON.stringify({ microcurso_id: microcurso.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Error inesperado', detalle: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
