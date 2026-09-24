// Inductoria · Edge Function: empleado-curso
// ------------------------------------------------
// Trae el contenido completo (pasos + preguntas) de UN curso puntual,
// validando token + PIN del empleado (_shared/empleado-auth.ts). Se llama
// al hacer clic en un curso pendiente O ya completado desde "Mi perfil".
//
// Ahora también trae el progreso propio del empleado en este curso
// (completado, puntaje, correctas, total, acuse_confirmado_at). Antes
// CursoDetalle.jsx solo sabía si ya lo había completado mirando un
// resultado guardado en localStorage del propio navegador, lo que hacía
// imposible volver a entrar a la pantalla de resultado (por ejemplo para
// terminar de confirmar el acuse de recibido más tarde, o desde otro
// dispositivo) una vez que esa pestaña se cerraba. Con esto el servidor
// es la fuente de verdad.
//
// 2026-09-24: el progreso que se devuelve es SOLO el de la versión actual
// del curso (progreso_empleado tiene una fila por versión). Si completó
// una versión anterior y no la actual, `progreso` viene null (tiene que
// hacer la versión nueva) y `version_anterior_completada` en true para
// avisarle. Además el curso tiene que estar publicado ('aprobado'), ser
// de su cuenta y estar asignado a su puesto, igual que en Mi perfil.

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
  ultimaVersionAnteriorCompletada,
} from '../_shared/empleado-auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsEmpleado });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const microcursoId = url.searchParams.get('microcurso_id');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const auth = await autenticarEmpleado(supabase, token, leerPin(req));
    if (auth.error) return respuestaError(auth.error);
    const empleado = auth.empleado;

    if (!microcursoId) {
      return respuestaJson({ error: MENSAJE_CURSO_NO_DISPONIBLE }, 400);
    }

    const cuentaId = await obtenerCuentaId(supabase, empleado.negocio_id);

    const { data: microcurso, error: microcursoError } = await supabase
      .from('microcursos')
      .select('id, titulo, duracion_min, preguntas, cuenta_id, estado, puestos_aplicables, version')
      .eq('id', microcursoId)
      .maybeSingle();

    if (microcursoError) {
      // Un id con formato inválido también cae acá: se trata como curso
      // inexistente, sin mostrar el error crudo.
      console.error('empleado-curso:', microcursoError);
    }
    if (microcursoError || !cursoAccesible(microcurso, cuentaId, empleado.puesto)) {
      return respuestaJson({ error: MENSAJE_CURSO_NO_DISPONIBLE }, 404);
    }

    const { data: pasos, error: pasosError } = await supabase
      .from('pasos')
      .select('id, orden, titulo, contenido')
      .eq('microcurso_id', microcursoId)
      .order('orden', { ascending: true });

    if (pasosError) throw pasosError;

    // Nunca mandamos cuál es la respuesta correcta al frontend del
    // empleado, solo la pregunta y las opciones. Eso se valida en
    // empleado-completar-curso, del lado del servidor.
    const preguntasSinRespuesta = (microcurso.preguntas || []).map((p: any) => ({
      pregunta: p.pregunta,
      opciones: p.opciones,
    }));

    // Todas las filas de progreso de este empleado en este curso (una por
    // versión) y nos quedamos con la de la versión actual.
    const versionActual = microcurso.version || 1;
    const { data: filas, error: progresoError } = await supabase
      .from('progreso_empleado')
      .select('completado, puntaje, correctas, total, fecha_completado, acuse_confirmado_at, version, version_completada')
      .eq('empleado_id', empleado.id)
      .eq('microcurso_id', microcursoId);

    if (progresoError) throw progresoError;

    const progreso = filaDeVersion(filas || [], versionActual);
    const versionAnteriorCompletada =
      !progreso?.completado && !!ultimaVersionAnteriorCompletada(filas || [], versionActual);

    return respuestaJson({
      titulo: microcurso.titulo,
      duracion_min: microcurso.duracion_min,
      version: versionActual,
      pasos: pasos || [],
      preguntas: preguntasSinRespuesta,
      progreso: progreso
        ? {
            completado: !!progreso.completado,
            puntaje: progreso.puntaje,
            correctas: progreso.correctas,
            total: progreso.total,
            // La fecha solo tiene sentido si esta versión está aprobada
            // (si reprobó un reintento, la fila guarda la fecha vieja).
            fecha_completado: progreso.completado ? progreso.fecha_completado : null,
            acuse_confirmado_at: progreso.completado ? progreso.acuse_confirmado_at : null,
          }
        : null,
      version_anterior_completada: versionAnteriorCompletada,
    });
  } catch (err) {
    return respuestaErrorServidor(err);
  }
});
