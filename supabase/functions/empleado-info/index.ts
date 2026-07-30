// Inductoria · Edge Function: empleado-info
// ------------------------------------------------
// El empleado no tiene login de Supabase, entra con un link que trae un
// token (?token=xxxx). Esta función valida ese token a mano (no hay
// RLS que lo cubra, porque no hay auth.uid() del lado del empleado) y
// devuelve su nombre, la sucursal/cuenta a la que pertenece, y la lista
// de microcursos aprobados con su progreso.
//
// Requiere la anon key como Bearer token (Verify JWT queda activado,
// como en las demás funciones), no requiere que haya un usuario logueado.

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

    // 1. Buscar al empleado por token, y que siga activo (sin fecha_baja).
    const { data: empleado, error: empleadoError } = await supabase
      .from('empleados')
      .select('id, nombre, negocio_id, fecha_baja')
      .eq('token_acceso', token)
      .maybeSingle();

    if (empleadoError) throw empleadoError;

    if (!empleado || empleado.fecha_baja) {
      return new Response(JSON.stringify({ error: 'Link no válido o de baja' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Traer la sucursal y la cuenta a la que pertenece.
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

    // 3. Microcursos aprobados de esa cuenta (compartidos entre todas
    // sus sucursales, ya que hoy el contenido vive a nivel cuenta).
    const { data: microcursos, error: microcursosError } = await supabase
      .from('microcursos')
      .select('id, titulo, duracion_min')
      .eq('cuenta_id', negocio.cuenta_id)
      .eq('estado', 'aprobado')
      .order('created_at', { ascending: true });

    if (microcursosError) throw microcursosError;

    // 4. Progreso de este empleado puntual, para cruzarlo con la lista.
    const { data: progreso, error: progresoError } = await supabase
      .from('progreso_empleado')
      .select('microcurso_id, completado, puntaje')
      .eq('empleado_id', empleado.id);

    if (progresoError) throw progresoError;

    const progresoPorCurso = {};
    (progreso || []).forEach((p) => {
      progresoPorCurso[p.microcurso_id] = p;
    });

    const microcursosConProgreso = (microcursos || []).map((m) => ({
      id: m.id,
      titulo: m.titulo,
      duracion_min: m.duracion_min,
      completado: progresoPorCurso[m.id]?.completado || false,
      puntaje: progresoPorCurso[m.id]?.puntaje ?? null,
    }));

    return new Response(
      JSON.stringify({
        empleado: { nombre: empleado.nombre },
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
