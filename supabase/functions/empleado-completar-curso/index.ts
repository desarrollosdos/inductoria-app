// Inductoria · Edge Function: empleado-completar-curso
// ------------------------------------------------
// El empleado terminó de leer los pasos y respondió la evaluación.
// Esto valida las respuestas contra las correctas (que nunca viajaron
// al frontend), calcula el puntaje, y guarda progreso_empleado.
//
// Antes: siempre guardaba completado=true sin importar el puntaje, y no
// quedaba ningún registro de que alguien hubiera reprobado. Ahora: solo
// se marca completado si llega al UMBRAL_APROBACION, y cada intento
// (apruebe o no) queda guardado en la tabla `intentos_evaluacion` para
// que el dueño pueda ver el historial en Progreso.
//
// 2026-09-07, a pedido de Roberto: antes había UNA sola fila de progreso
// por empleado+curso, así que completar una versión nueva pisaba el
// registro de la versión anterior (se perdía que había hecho "Gestión
// de caja v1" antes de hacer "v2"). Ahora cada fila de progreso queda
// atada a la versión del curso en la que se hizo (columna `version`,
// nueva — ver migración). Si el empleado repite la MISMA versión
// (reintenta después de reprobar, o vuelve a rendir aunque ya haya
// aprobado), se actualiza esa fila. Si el curso cambió de versión desde
// la última vez, se crea una fila NUEVA para la versión nueva, y la
// fila de la versión anterior queda intacta como historial.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mismo corte que usa CursoDetalle.jsx para pintar el pill de resultado en
// verde/terracota — si este número cambia, tiene que cambiar en los dos
// lugares (acá es el que realmente decide si el curso queda aprobado).
const UMBRAL_APROBACION = 70;

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
      .select('id, preguntas, cuenta_id, version')
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
    const aprobado = puntaje >= UMBRAL_APROBACION;
    const versionCurso = microcurso.version || 1;

    // ¿Ya existe progreso previo para este empleado + curso + ESTA versión?
    // Si sí, lo actualizamos (reintento sobre la misma versión). Si no
    // (primera vez, o el curso cambió de versión desde el último intento),
    // se crea una fila nueva — la de la versión anterior queda como
    // historial, sin tocarse.
    // `completado` refleja el resultado de este ÚLTIMO intento sobre esta
    // versión: si no aprueba, esta fila vuelve a quedar pendiente aunque
    // antes la hubiera aprobado. `fecha_completado` y `version_completada`
    // solo se tocan cuando aprueba, para no pisar el registro real de
    // cuándo y en qué versión aprobó con el de un intento fallido.
    const { data: existente } = await supabase
      .from('progreso_empleado')
      .select('id')
      .eq('empleado_id', empleado.id)
      .eq('microcurso_id', microcurso_id)
      .eq('version', versionCurso)
      .maybeSingle();

    const camposProgreso = {
      puntaje,
      correctas,
      total: preguntas.length,
      completado: aprobado,
      version: versionCurso,
      ...(aprobado
        ? { fecha_completado: new Date().toISOString(), version_completada: versionCurso }
        : {}),
    };

    if (existente) {
      await supabase.from('progreso_empleado').update(camposProgreso).eq('id', existente.id);
    } else {
      await supabase.from('progreso_empleado').insert({
        empleado_id: empleado.id,
        microcurso_id,
        ...camposProgreso,
      });
    }

    // Historial completo de intentos (apruebe o no), para que el dueño
    // pueda ver en Progreso quién reprobó y cuántas veces. A diferencia de
    // progreso_empleado (una fila por empleado+curso+versión, se pisa
    // dentro de la misma versión), acá se inserta una fila nueva por cada
    // envío.
    const { error: intentoError } = await supabase.from('intentos_evaluacion').insert({
      empleado_id: empleado.id,
      microcurso_id,
      puntaje,
      correctas,
      total: preguntas.length,
      aprobado,
    });
    if (intentoError) {
      // No corta el flujo: el empleado ya tiene su resultado guardado en
      // progreso_empleado, que es lo crítico. Si falta la tabla porque
      // todavía no se corrió la migración, esto solo se ve en los logs.
      console.error('No se pudo guardar el intento en intentos_evaluacion:', intentoError);
    }

    return new Response(JSON.stringify({ puntaje, correctas, total: preguntas.length, aprobado }), {
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
