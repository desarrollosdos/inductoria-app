// Inductoria · Edge Function: actualizar-curso-ia
// ------------------------------------------------
// El dueño aprieta "Actualizar contenido" sobre un curso ya publicado,
// suma material nuevo (texto), y esto le pide a Claude que regenere el
// curso completo (mismo formato que procesar-contenido) combinando el
// material original + el nuevo. A diferencia de procesar-contenido, esto
// NUNCA crea un microcurso nuevo ni lo borra: actualiza el mismo registro
// (titulo, duracion_min, preguntas, pasos) para no perder el historial de
// progreso de los empleados que ya lo completaron, y marca actualizado_at
// para que esos empleados vean el aviso de "contenido actualizado".

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
    const microcursoId = body.microcurso_id;
    const textoNuevo = (body.texto_nuevo || '').trim();

    if (!microcursoId || !textoNuevo) {
      return new Response(JSON.stringify({ error: 'Falta el curso o el contenido nuevo' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Confirmamos que el curso sea de una cuenta del usuario que llama.
    const { data: microcurso, error: microcursoError } = await supabase
      .from('microcursos')
      .select('*, cuentas!inner(owner_id)')
      .eq('id', microcursoId)
      .single();

    if (microcursoError || !microcurso || microcurso.cuentas.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Curso no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (microcurso.estado !== 'aprobado') {
      return new Response(JSON.stringify({ error: 'Este curso no está publicado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscamos el contenido original vinculado (si existe) para sumar el
    // material previo al nuevo. Los cursos de biblioteca (cursos_base) no
    // tienen un contenido vinculado, en ese caso se arranca solo del texto
    // nuevo más los pasos actuales como referencia.
    const { data: contenidoOriginal } = await supabase
      .from('contenidos')
      .select('*')
      .eq('microcurso_id', microcursoId)
      .maybeSingle();

    const { data: pasosActuales } = await supabase
      .from('pasos')
      .select('titulo, contenido')
      .eq('microcurso_id', microcursoId)
      .order('orden', { ascending: true });

    const materialPrevio =
      contenidoOriginal?.texto_procesado ||
      (pasosActuales || []).map((p) => `${p.titulo}\n${p.contenido}`).join('\n\n');

    const textoCombinado = `${materialPrevio}\n\n---\nMaterial adicional agregado después:\n${textoNuevo}`;

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;

    const prompt = `Convertí el siguiente material de capacitación de un comercio en un curso completo y serio para un empleado nuevo, con el mismo nivel de profundidad y formato que usaría una plataforma de capacitación profesional (no un resumen ni un apunte rápido).

Estructura obligatoria, siempre 5 pasos, en este orden:
1. Marco y por qué importa: contexto de por qué este tema es relevante para el puesto (si el material menciona una norma, ley o estándar, citala acá con precisión; si no menciona ninguna, explicá el motivo práctico/de negocio).
2 a 4. Desarrollo práctico: el contenido concreto dividido en 3 pasos temáticos coherentes (por ejemplo, separado por proceso, por situación, o por tipo de tarea, según lo que tenga sentido para el material).
5. Qué hacer ante problemas o casos límite, y cierre: qué hacer cuando algo sale mal o hay dudas, y una idea final que resuma el punto central del curso.

Reglas de contenido:
- Cada uno de los 5 pasos tiene que tener entre 200 y 280 palabras. No menos. Esto no es negociable: un paso de 3 líneas no sirve para capacitar a nadie.
- Desarrollá el POR QUÉ de cada cosa, no solo el QUÉ. Sumá contexto y al menos un ejemplo concreto o situación típica del día a día del comercio en cada paso donde ayude a entender mejor.
- Si dentro de un paso hay una lista de reglas, pasos a seguir, o ítems puntuales (cosas que sí hacer, cosas que no hacer, checklist), escribilos como líneas separadas por salto de línea, cada una arrancando con un guión "-". Si en cambio es una explicación conceptual corrida, escribila como párrafo normal, sin guiones. Podés combinar: un párrafo de contexto seguido de una lista con guiones dentro del mismo paso.
- Tono serio y profesional, pero en segunda persona ("vos"), tono argentino, sin sonar acartonado ni como un trámite burocrático — como si un compañero con experiencia real le explicara el tema a alguien que recién arranca.
- Exactamente 5 preguntas de opción múltiple (3 opciones cada una), una por cada paso, que evalúen el punto central de ESE paso puntual, no detalles menores ni trivia.
- Este material combina contenido que ya estaba en el curso publicado más contenido nuevo que se acaba de sumar. Integrá todo en un curso único y coherente, no los trates como dos secciones separadas.
- No inventes información que no esté en el material original. Si el material es corto, desarrollá y explicá mejor lo que SÍ está (con más contexto, ejemplos y aplicación práctica), pero no agregues datos, cifras o normas que no estén en el original.

Material:
"""
${textoCombinado}
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
      return new Response(JSON.stringify({ error: 'No se pudo actualizar el curso' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const claudeData = await claudeRes.json();
    const textoRespuesta = claudeData.content?.[0]?.text || '';

    const usage = claudeData.usage || {};
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const costoUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

    const { error: usageError } = await supabase.from('ai_usage_log').insert({
      cuenta_id: microcurso.cuenta_id,
      contenido_id: contenidoOriginal?.id || null,
      model: 'claude-haiku-4-5-20251001',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      costo_usd: costoUsd,
    });
    if (usageError) console.error('No se pudo registrar el costo de IA:', usageError);

    const jsonLimpio = textoRespuesta.replace(/```json|```/g, '').trim();

    let cursoRegenerado;
    try {
      cursoRegenerado = JSON.parse(jsonLimpio);
    } catch (e) {
      console.error('No se pudo parsear la respuesta de Claude:', textoRespuesta);
      return new Response(JSON.stringify({ error: 'La IA devolvió una respuesta inválida' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Actualizamos el MISMO microcurso (nunca uno nuevo), y marcamos
    // actualizado_at para que los empleados que ya lo completaron vean
    // el aviso de contenido actualizado.
    const { error: updateError } = await supabase
      .from('microcursos')
      .update({
        titulo: cursoRegenerado.titulo,
        duracion_min: cursoRegenerado.duracion_min || null,
        preguntas: cursoRegenerado.preguntas || [],
        actualizado_at: new Date().toISOString(),
      })
      .eq('id', microcursoId);

    if (updateError) throw updateError;

    // Reemplazamos los pasos: borramos los viejos e insertamos los nuevos.
    await supabase.from('pasos').delete().eq('microcurso_id', microcursoId);

    const pasosAInsertar = (cursoRegenerado.pasos || []).map((p: any, i: number) => ({
      microcurso_id: microcursoId,
      orden: i + 1,
      titulo: p.titulo,
      contenido: p.contenido,
    }));

    if (pasosAInsertar.length > 0) {
      const { error: pasosError } = await supabase.from('pasos').insert(pasosAInsertar);
      if (pasosError) throw pasosError;
    }

    // Guardamos el texto combinado como el nuevo "material original", así
    // la próxima actualización sigue construyendo sobre todo lo acumulado.
    if (contenidoOriginal) {
      await supabase
        .from('contenidos')
        .update({ texto_procesado: textoCombinado })
        .eq('id', contenidoOriginal.id);
    }

    return new Response(JSON.stringify({ ok: true, titulo: cursoRegenerado.titulo }), {
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
