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
// nueva, ver migración). Si el empleado repite la MISMA versión
// (reintenta después de reprobar, o vuelve a rendir aunque ya haya
// aprobado), se actualiza esa fila. Si el curso cambió de versión desde
// la última vez, se crea una fila NUEVA para la versión nueva, y la
// fila de la versión anterior queda intacta como historial.
//
// 2026-09-24: valida token + PIN (_shared/empleado-auth.ts), exige que el
// curso esté publicado, sea de su cuenta y de su puesto, y reconoce las
// filas viejas sin `version` (de antes del 2026-09-07) como la versión
// que les corresponde, para no duplicarlas. Devuelve fecha_completado
// para que el certificado use la fecha real.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  autenticarEmpleado,
  corsEmpleado,
  cursoAccesible,
  filaDeVersion,
  leerPin,
  MENSAJE_CURSO_NO_DISPONIBLE,
  obtenerCuentaId,
  respuestaError,
  respuestaErrorServidor,
  respuestaJson,
} from '../_shared/empleado-auth.ts';

// Mismo corte que usa CursoDetalle.jsx para pintar el pill de resultado en
// verde/terracota. Si este número cambia, tiene que cambiar en los dos
// lugares (acá es el que realmente decide si el curso queda aprobado).
const UMBRAL_APROBACION = 70;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsEmpleado });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { token, microcurso_id, respuestas } = body || {};

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const auth = await autenticarEmpleado(supabase, token, leerPin(req));
    if (auth.error) return respuestaError(auth.error);
    const empleado = auth.empleado;

    if (!microcurso_id || !Array.isArray(respuestas)) {
      return respuestaJson({ error: 'Faltan tus respuestas. Volvé a intentarlo.' }, 400);
    }

    const cuentaId = await obtenerCuentaId(supabase, empleado.negocio_id);

    const { data: microcurso, error: microcursoError } = await supabase
      .from('microcursos')
      .select('id, preguntas, cuenta_id, estado, puestos_aplicables, version')
      .eq('id', microcurso_id)
      .maybeSingle();

    if (microcursoError) console.error('empleado-completar-curso:', microcursoError);
    if (microcursoError || !cursoAccesible(microcurso, cuentaId, empleado.puesto)) {
      return respuestaJson({ error: MENSAJE_CURSO_NO_DISPONIBLE }, 404);
    }

    const preguntas = microcurso.preguntas || [];
    let correctas = 0;
    preguntas.forEach((p: any, i: number) => {
      if (respuestas[i] === p.correcta) correctas++;
    });
    const puntaje = preguntas.length > 0 ? Math.round((correctas / preguntas.length) * 100) : 100;
    const aprobado = puntaje >= UMBRAL_APROBACION;
    const versionCurso = microcurso.version || 1;
    const ahora = new Date().toISOString();

    // ¿Ya existe progreso para este empleado + curso + ESTA versión?
    // Si sí, lo actualizamos (reintento sobre la misma versión). Si no
    // (primera vez, o el curso cambió de versión desde el último intento),
    // se crea una fila nueva y la de la versión anterior queda como
    // historial, sin tocarse. Se traen todas las filas del curso para
    // reconocer también las viejas sin `version`.
    // `completado` refleja el resultado de este ÚLTIMO intento sobre esta
    // versión: si no aprueba, esta fila vuelve a quedar pendiente aunque
    // antes la hubiera aprobado. `fecha_completado` y `version_completada`
    // solo se tocan cuando aprueba, para no pisar el registro real de
    // cuándo y en qué versión aprobó con el de un intento fallido.
    const { data: filas, error: filasError } = await supabase
      .from('progreso_empleado')
      .select('id, completado, fecha_completado, version, version_completada')
      .eq('empleado_id', empleado.id)
      .eq('microcurso_id', microcurso_id);

    if (filasError) throw filasError;

    const existente = filaDeVersion(filas || [], versionCurso);

    const camposProgreso = {
      puntaje,
      correctas,
      total: preguntas.length,
      completado: aprobado,
      version: versionCurso,
      ...(aprobado ? { fecha_completado: ahora, version_completada: versionCurso } : {}),
    };

    if (existente) {
      const { error: updateError } = await supabase
        .from('progreso_empleado')
        .update(camposProgreso)
        .eq('id', existente.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from('progreso_empleado').insert({
        empleado_id: empleado.id,
        microcurso_id,
        ...camposProgreso,
      });
      if (insertError) throw insertError;
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

    return respuestaJson({
      puntaje,
      correctas,
      total: preguntas.length,
      aprobado,
      version: versionCurso,
      fecha_completado: aprobado ? ahora : null,
    });
  } catch (err) {
    return respuestaErrorServidor(err);
  }
});
