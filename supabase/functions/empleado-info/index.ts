// Inductoria · Edge Function: empleado-info
// ------------------------------------------------
// El empleado no tiene login de Supabase, entra con un link que trae un
// token (?token=xxxx). Esta función valida ese token a mano y devuelve
// todo lo necesario para "Mi perfil": sus datos, y la lista de cursos
// (pendientes/completados) con fecha límite si tiene, y si el curso fue
// actualizado después de que el empleado ya lo había completado.

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
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Falta el token' }), {
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
      .select('id, nombre, puesto, foto_url, fecha_alta, negocio_id, fecha_baja')
      .eq('token_acceso', token)
      .maybeSingle();

    if (empleadoError) throw empleadoError;

    if (!empleado || empleado.fecha_baja) {
      return new Response(JSON.stringify({ error: 'Link no válido o de baja' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: negocio, error: negocioError } = await supabase
      .from('negocios')
      .select('id, nombre, cuenta_id')
      .eq('id', empleado.negocio_id)
      .single();

    if (negocioError) throw negocioError;

    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas')
      .select('nombre')
      .eq('id', negocio.cuenta_id)
      .single();

    if (cuentaError) throw cuentaError;

    const { data: microcursos, error: microcursosError } = await supabase
      .from('microcursos')
      .select('id, titulo, duracion_min, fecha_limite, actualizado_at, puestos_aplicables')
      .eq('cuenta_id', negocio.cuenta_id)
      .eq('estado', 'aprobado')
      .order('created_at', { ascending: true });

    if (microcursosError) throw microcursosError;

    // Un curso sin puestos_aplicables (null o vacío) todavía no fue
    // publicado para nadie — el dueño no eligió a quién asignarlo. Con
    // 'TODOS' explícito se le asigna a cualquier puesto; con puestos
    // puntuales, solo a esos.
    const microcursosParaEmpleado = (microcursos || []).filter((m) => {
      const puestos = m.puestos_aplicables;
      if (!puestos || puestos.length === 0) return false;
      if (puestos.includes('TODOS')) return true;
      return empleado.puesto && puestos.includes(empleado.puesto);
    });

    const { data: progreso, error: progresoError } = await supabase
      .from('progreso_empleado')
      .select('microcurso_id, completado, puntaje, fecha_completado')
      .eq('empleado_id', empleado.id);

    if (progresoError) throw progresoError;

    const progresoPorCurso: Record<string, any> = {};
    (progreso || []).forEach((p) => {
      progresoPorCurso[p.microcurso_id] = p;
    });

    const microcursosConProgreso = microcursosParaEmpleado.map((m) => {
      const p = progresoPorCurso[m.id];
      const completado = p?.completado || false;
      const fechaCompletado = p?.fecha_completado ?? null;

      // Si el curso se actualizó (regeneró con IA) después de que el
      // empleado ya lo había completado, se lo marcamos para que vuelva
      // a revisarlo.
      const actualizadoDespues =
        completado && fechaCompletado && m.actualizado_at
          ? new Date(m.actualizado_at).getTime() > new Date(fechaCompletado).getTime()
          : false;

      return {
        id: m.id,
        titulo: m.titulo,
        duracion_min: m.duracion_min,
        fecha_limite: m.fecha_limite,
        completado,
        puntaje: p?.puntaje ?? null,
        fecha_completado: fechaCompletado,
        actualizado_despues_de_completar: actualizadoDespues,
      };
    });

    return new Response(
      JSON.stringify({
        empleado: {
          nombre: empleado.nombre,
          puesto: empleado.puesto,
          foto_url: empleado.foto_url,
          fecha_alta: empleado.fecha_alta,
        },
        negocio: { nombre: negocio.nombre },
        cuenta: { nombre: cuenta.nombre },
        microcursos: microcursosConProgreso,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Error inesperado', detalle: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
