// Inductoria · Edge Function: admin-metrics
// ------------------------------------------------
// Métricas generales para el panel de Admin (visible solo para
// desarrollosdos@gmail.com). Usa service role para ver todas las
// cuentas, no solo la del usuario logueado (a diferencia del resto
// de la app, que siempre queda acotado por RLS a "lo mío").

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

    const [
      { count: totalCuentas },
      { count: totalNegocios },
      { count: totalEmpleadosActivos },
      { count: totalMicrocursos },
      { data: cuentasPorPlan },
    ] = await Promise.all([
      supabase.from('cuentas').select('*', { count: 'exact', head: true }),
      supabase.from('negocios').select('*', { count: 'exact', head: true }),
      supabase.from('empleados').select('*', { count: 'exact', head: true }).is('fecha_baja', null),
      supabase.from('microcursos').select('*', { count: 'exact', head: true }),
      supabase.from('cuentas').select('plan'),
    ]);

    const planCounts = {};
    (cuentasPorPlan || []).forEach((c) => {
      planCounts[c.plan] = (planCounts[c.plan] || 0) + 1;
    });

    // Últimas 10 cuentas creadas, para ver actividad reciente.
    const { data: ultimasCuentas } = await supabase
      .from('cuentas')
      .select('id, nombre, plan, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    return new Response(
      JSON.stringify({
        totalCuentas: totalCuentas || 0,
        totalNegocios: totalNegocios || 0,
        totalEmpleadosActivos: totalEmpleadosActivos || 0,
        totalMicrocursos: totalMicrocursos || 0,
        planCounts,
        ultimasCuentas: ultimasCuentas || [],
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
