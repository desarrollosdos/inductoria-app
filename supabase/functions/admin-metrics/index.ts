// Inductoria · Edge Function: admin-metrics
// ------------------------------------------------
// Métricas completas para el panel de Admin (visible solo para
// desarrollosdos@gmail.com). Usa service role para ver todas las
// cuentas, no solo la del usuario logueado.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAIL = 'desarrollosdos@gmail.com';

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

    if (userError || !user || user.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // -----------------------------
    // Datos base: todas las cuentas, negocios y empleados activos
    // -----------------------------
    const { data: cuentas } = await supabase
      .from('cuentas')
      .select('id, nombre, plan, sucursales_contratadas, created_at')
      .order('created_at', { ascending: false });

    const { data: negocios } = await supabase.from('negocios').select('id, cuenta_id');

    const { data: empleados } = await supabase
      .from('empleados')
      .select('id, negocio_id')
      .is('fecha_baja', null);

    const { count: totalMicrocursos } = await supabase
      .from('microcursos')
      .select('*', { count: 'exact', head: true });

    const negociosPorCuenta: Record<string, string[]> = {};
    (negocios || []).forEach((n) => {
      if (!negociosPorCuenta[n.cuenta_id]) negociosPorCuenta[n.cuenta_id] = [];
      negociosPorCuenta[n.cuenta_id].push(n.id);
    });

    const negocioACuenta: Record<string, string> = {};
    (negocios || []).forEach((n) => (negocioACuenta[n.id] = n.cuenta_id));

    const empleadosPorCuenta: Record<string, number> = {};
    (empleados || []).forEach((e) => {
      const cuentaId = negocioACuenta[e.negocio_id];
      if (!cuentaId) return;
      empleadosPorCuenta[cuentaId] = (empleadosPorCuenta[cuentaId] || 0) + 1;
    });

    // -----------------------------
    // Resumen
    // -----------------------------
    const planCounts: Record<string, number> = {};
    (cuentas || []).forEach((c) => {
      planCounts[c.plan] = (planCounts[c.plan] || 0) + 1;
    });

    const resumen = {
      totalCuentas: (cuentas || []).length,
      totalNegocios: (negocios || []).length,
      totalEmpleadosActivos: (empleados || []).length,
      totalMicrocursos: totalMicrocursos || 0,
      planCounts,
      ultimasCuentas: (cuentas || []).slice(0, 10),
    };

    // -----------------------------
    // Clientes e historial: todas las cuentas con su detalle
    // -----------------------------
    const clientes = (cuentas || []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      plan: c.plan,
      sucursales: (negociosPorCuenta[c.id] || []).length,
      sucursalesContratadas: c.sucursales_contratadas,
      empleados: empleadosPorCuenta[c.id] || 0,
      created_at: c.created_at,
    }));

    // -----------------------------
    // Riesgos y análisis
    // -----------------------------
    const pagoEnRiesgo = clientes.filter((c) => ['past_due', 'suspended', 'cancelled'].includes(c.plan));
    const sinEmpleados = clientes.filter((c) => c.empleados === 0);
    const cupoLleno = clientes.filter((c) => c.sucursales >= c.sucursalesContratadas && c.sucursales > 0);

    const riesgos = { pagoEnRiesgo, sinEmpleados, cupoLleno };

    return new Response(JSON.stringify({ resumen, clientes, riesgos }), {
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
