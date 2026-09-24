// Inductoria · Edge Function: empleado-info
// ------------------------------------------------
// El empleado no tiene login de Supabase, entra con un link que trae un
// token (?token=xxxx) y confirma con su PIN (header x-empleado-pin, ver
// _shared/empleado-auth.ts). Esta función valida los dos y devuelve todo
// lo necesario para "Mi perfil": sus datos, y la lista de cursos
// (pendientes/completados) con fecha límite si tiene, y si el curso se
// actualizó a una versión nueva después de que el empleado completó una
// anterior.
//
// Ahora también devuelve si hay un checklist operativo activo para su
// sucursal (checklist_disponible). Antes "Mi perfil" no tenía forma de
// saber esto, así que no había ningún link hacia la pantalla de checklist
// del empleado (que ni siquiera existía). Con este flag, el botón "Ver
// checklist de hoy" en Mi perfil solo aparece cuando corresponde, usando
// el mismo token de acceso, sin un link ni un PIN nuevo.
//
// 2026-09-24: versiones de curso. progreso_empleado tiene una fila por
// versión del curso (ver empleado-completar-curso). Lo que cuenta para
// "completado" es la fila de la versión ACTUAL (microcursos.version); las
// de versiones anteriores son historial. Si completó una versión vieja
// pero no la actual, el curso vuelve a pendientes con `desactualizado`
// para que Mi perfil muestre "Contenido actualizado, revisalo de nuevo".
// Antes esto se calculaba comparando actualizado_at contra la fecha de
// completado, que no coincidía con cómo se guardan las versiones.
//
// También devuelve `ia_disponible`, para que la pantalla del curso solo
// muestre el chat de dudas si la cuenta puede usarlo (mismo criterio que
// preguntar-curso, _shared/acceso.ts).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { puedeUsarIA } from '../_shared/acceso.ts';
import {
  aplicaAlPuesto,
  autenticarEmpleado,
  corsEmpleado,
  filaDeVersion,
  leerPin,
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const auth = await autenticarEmpleado(supabase, token, leerPin(req));
    if (auth.error) return respuestaError(auth.error);
    const empleado = auth.empleado;

    const { data: negocio, error: negocioError } = await supabase
      .from('negocios')
      .select('id, nombre, cuenta_id')
      .eq('id', empleado.negocio_id)
      .single();

    if (negocioError) throw negocioError;

    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas')
      .select('nombre, checklists_habilitado, plan, trial_ends_at')
      .eq('id', negocio.cuenta_id)
      .single();

    if (cuentaError) throw cuentaError;

    const { data: microcursos, error: microcursosError } = await supabase
      .from('microcursos')
      .select('id, titulo, duracion_min, fecha_limite, puestos_aplicables, version')
      .eq('cuenta_id', negocio.cuenta_id)
      .eq('estado', 'aprobado')
      .order('created_at', { ascending: true });

    if (microcursosError) throw microcursosError;

    // Un curso sin puestos_aplicables (null o vacío) todavía no fue
    // publicado para nadie, porque el dueño no eligió a quién asignarlo.
    // Con 'TODOS' explícito se le asigna a cualquier puesto; con puestos
    // puntuales, solo a esos.
    const microcursosParaEmpleado = (microcursos || []).filter((m: any) =>
      aplicaAlPuesto(m.puestos_aplicables, empleado.puesto)
    );

    const { data: progreso, error: progresoError } = await supabase
      .from('progreso_empleado')
      .select('microcurso_id, completado, puntaje, fecha_completado, version, version_completada')
      .eq('empleado_id', empleado.id);

    if (progresoError) throw progresoError;

    const filasPorCurso: Record<string, any[]> = {};
    (progreso || []).forEach((p: any) => {
      if (!filasPorCurso[p.microcurso_id]) filasPorCurso[p.microcurso_id] = [];
      filasPorCurso[p.microcurso_id].push(p);
    });

    const microcursosConProgreso = microcursosParaEmpleado.map((m: any) => {
      const versionActual = m.version || 1;
      const filas = filasPorCurso[m.id] || [];
      const actual = filaDeVersion(filas, versionActual);
      const completado = !!actual?.completado;

      // Completó una versión anterior pero todavía no la actual: tiene
      // que volver a hacerlo. Se muestra en pendientes con el aviso.
      const anterior = completado ? null : ultimaVersionAnteriorCompletada(filas, versionActual);
      const desactualizado = !!anterior;

      return {
        id: m.id,
        titulo: m.titulo,
        duracion_min: m.duracion_min,
        fecha_limite: m.fecha_limite,
        version: versionActual,
        completado,
        puntaje: completado ? actual?.puntaje ?? null : null,
        fecha_completado: completado ? actual?.fecha_completado ?? null : null,
        desactualizado,
        fecha_completado_version_anterior: anterior?.fecha_completado ?? null,
        // Nombre anterior del mismo flag, por compatibilidad.
        actualizado_despues_de_completar: desactualizado,
      };
    });

    // ¿Hay al menos un checklist operativo activo para la sucursal de
    // este empleado QUE ADEMÁS aplique a su puesto? (por ejemplo "cierre
    // de caja" es solo para cajeros, no para mozos). Mismo criterio que
    // ya se usa arriba para microcursosParaEmpleado. Si la cuenta no
    // tiene la funcionalidad habilitada, ni siquiera se consulta.
    let checklistDisponible = false;
    if (cuenta.checklists_habilitado) {
      const { data: checklistsActivos } = await supabase
        .from('checklists')
        .select('id, puestos_aplicables')
        .eq('negocio_id', empleado.negocio_id)
        .eq('activo', true);

      checklistDisponible = (checklistsActivos || []).some((c: any) =>
        aplicaAlPuesto(c.puestos_aplicables, empleado.puesto)
      );
    }

    return respuestaJson({
      empleado: {
        nombre: empleado.nombre,
        puesto: empleado.puesto,
        foto_url: empleado.foto_url,
        fecha_alta: empleado.fecha_alta,
      },
      negocio: { nombre: negocio.nombre },
      cuenta: { nombre: cuenta.nombre },
      microcursos: microcursosConProgreso,
      checklist_disponible: checklistDisponible,
      ia_disponible: puedeUsarIA({ plan: cuenta.plan, trial_ends_at: cuenta.trial_ends_at }),
    });
  } catch (err) {
    return respuestaErrorServidor(err);
  }
});
