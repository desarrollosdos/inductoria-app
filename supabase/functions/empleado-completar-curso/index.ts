// Inductoria · Edge Function: empleado-completar-curso
// ------------------------------------------------
// El empleado terminó de leer los pasos y respondió la evaluación.
// Esto valida las respuestas contra las correctas (que nunca viajaron
// al frontend), calcula el puntaje, y guarda progreso_empleado.

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
    const body = await req.json();
    const { token, microcurso_id, respuestas } = body;

    if (!token || !microcurso_id || !Array.isArray(respuestas)) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: empleado, error: empleadoError } = await supabase
      .from('empleados')
      .select('id, negocio_id, fecha_baja')
      .eq('token_acceso', token)
      .maybeSingle();

    if (empleadoError) throw empleadoError;
    if (!empleado || empleado.fecha_baja) {
      return new Response(JSON.stringify({ error: 'Link no válido' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: negocio } = await supabase
      .from('negocios')
      .select('cuenta_id')
      .eq('id', empleado.negocio_id)
      .single();

    const { data: microcurso, error: microcursoError } = await supabase
      .from('microcursos')
      .select('id, preguntas, cuenta_id')
      .eq('id', microcurso_id)
      .single();

    if (microcursoError || !microcurso || microcurso.cuenta_id !== negocio?.cuenta_id) {
      return new Response(JSON.stringify({ error: 'Curso no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const preguntas = microcurso.preguntas || [];
    let correctas = 0;
    preguntas.forEach((p: any, i: number) => {
      if (respuestas[i] === p.correcta) correctas++;
    });
    const puntaje = preguntas.length > 0 ? Math.round((correctas / preguntas.length) * 100) : 100;

    // ¿Ya existe un progreso previo para este empleado + curso? Si sí,
    // lo actualizamos (por si repite el curso), si no, lo creamos.
    const { data: existente } = await supabase
      .from('progreso_empleado')
      .select('id')
      .eq('empleado_id', empleado.id)
      .eq('microcurso_id', microcurso_id)
      .maybeSingle();

    if (existente) {
      await supabase
        .from('progreso_empleado')
        .update({ completado: true, puntaje, fecha_completado: new Date().toISOString() })
        .eq('id', existente.id);
    } else {
      await supabase.from('progreso_empleado').insert({
        empleado_id: empleado.id,
        microcurso_id,
        completado: true,
        puntaje,
        fecha_completado: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ puntaje, correctas, total: preguntas.length }), {
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
