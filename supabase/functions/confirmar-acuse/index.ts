// Inductoria · Edge Function: confirmar-acuse
// -----------------------------------------------
// Público, sin login (token + PIN del empleado, ver
// _shared/empleado-auth.ts). El empleado confirma explícitamente
// (checkbox + botón) haber leído y entendido el contenido de un curso ya
// aprobado. Guarda la fecha/hora exacta: es el "acuse de recibido" real,
// con peso legal, una acción afirmativa del empleado, con timestamp.
//
// Solo se puede confirmar sobre un curso que el empleado YA completó
// (progreso_empleado.completado = true); no se puede adelantar.
//
// 2026-09-24: progreso_empleado tiene una fila por versión del curso.
// Antes el update tocaba TODAS las filas del curso y el .maybeSingle()
// fallaba en cuanto había más de una versión. Ahora se confirma solo
// sobre la fila de la versión actual. Si ya estaba confirmado, se
// devuelve la fecha original sin pisarla (la fecha del acuse no se mueve).

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsEmpleado });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { token, microcurso_id } = body || {};

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const auth = await autenticarEmpleado(supabase, token, leerPin(req));
    if (auth.error) return respuestaError(auth.error);
    const empleado = auth.empleado;

    if (!microcurso_id) {
      return respuestaJson({ error: MENSAJE_CURSO_NO_DISPONIBLE }, 400);
    }

    const cuentaId = await obtenerCuentaId(supabase, empleado.negocio_id);
    const { data: microcurso, error: microcursoError } = await supabase
      .from('microcursos')
      .select('id, cuenta_id, estado, puestos_aplicables, version')
      .eq('id', microcurso_id)
      .maybeSingle();

    if (microcursoError) console.error('confirmar-acuse:', microcursoError);
    if (microcursoError || !cursoAccesible(microcurso, cuentaId, empleado.puesto)) {
      return respuestaJson({ error: MENSAJE_CURSO_NO_DISPONIBLE }, 404);
    }

    const { data: filas, error: filasError } = await supabase
      .from('progreso_empleado')
      .select('id, completado, fecha_completado, acuse_confirmado_at, version, version_completada')
      .eq('empleado_id', empleado.id)
      .eq('microcurso_id', microcurso_id);

    if (filasError) throw filasError;

    const fila = filaDeVersion(filas || [], microcurso.version || 1);

    if (!fila || !fila.completado) {
      return respuestaJson(
        { error: 'Primero tenés que aprobar este curso para poder confirmar que lo leíste.' },
        400
      );
    }

    if (fila.acuse_confirmado_at) {
      return respuestaJson({ ok: true, fecha: fila.acuse_confirmado_at });
    }

    const ahora = new Date().toISOString();
    const { data: actualizado, error: updateError } = await supabase
      .from('progreso_empleado')
      .update({ acuse_confirmado_at: ahora })
      .eq('id', fila.id)
      .eq('completado', true)
      .select('acuse_confirmado_at');

    if (updateError) throw updateError;

    if (!actualizado || actualizado.length === 0) {
      return respuestaJson(
        { error: 'Primero tenés que aprobar este curso para poder confirmar que lo leíste.' },
        400
      );
    }

    return respuestaJson({ ok: true, fecha: actualizado[0].acuse_confirmado_at });
  } catch (err) {
    return respuestaErrorServidor(err);
  }
});
