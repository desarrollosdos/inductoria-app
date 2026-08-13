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
      .select('id, owner_id, nombre, plan, sucursales_contratadas, created_at')
      .order('created_at', { ascending: false });

    const { data: negocios } = await supabase.from('negocios').select('id, cuenta_id');

    const { data: empleados } = await supabase
      .from('empleados')
      .select('id, negocio_id')
      .is('fecha_baja', null);

    const { count: totalMicrocursos } = await supabase
      .from('microcursos')
      .select('*', { count: 'exact', head: true });

    // -----------------------------
    // Última conexión por cuenta (vía Supabase Auth), cruzando por owner_id
    // -----------------------------
    const { data: usersData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const ultimaConexionPorId: Record<string, string | null> = {};
    (usersData?.users || []).forEach((u) => {
      ultimaConexionPorId[u.id] = u.last_sign_in_at ?? null;
    });

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
      ultimaConexion: ultimaConexionPorId[c.owner_id] || null,
    }));

    // -----------------------------
    // Riesgos y análisis
    // -----------------------------
    const pagoEnRiesgo = clientes.filter((c) => ['past_due', 'suspended', 'cancelled'].includes(c.plan));
    const sinEmpleados = clientes.filter((c) => c.empleados === 0);
    const cupoLleno = clientes.filter((c) => c.sucursales >= c.sucursalesContratadas && c.sucursales > 0);

    const riesgos = { pagoEnRiesgo, sinEmpleados, cupoLleno };

    // -----------------------------
    // Gaps de conocimiento: cursos donde más se pregunta en el chat de
    // dudas, con algunas preguntas de ejemplo. Un curso con muchas
    // preguntas repetidas probablemente está mal explicado en algún paso.
    // -----------------------------
    const { data: todosMicrocursos } = await supabase
      .from('microcursos')
      .select('id, titulo, cuenta_id')
      .eq('estado', 'aprobado');

    const { data: preguntasIA } = await supabase
      .from('preguntas_ia')
      .select('microcurso_id, pregunta');

    const nombrePorCuenta: Record<string, string> = {};
    (cuentas || []).forEach((c) => (nombrePorCuenta[c.id] = c.nombre));

    const infoPorCurso: Record<
      string,
      { titulo: string; cuenta: string; total: number; ejemplos: string[] }
    > = {};
    (todosMicrocursos || []).forEach((m) => {
      infoPorCurso[m.id] = {
        titulo: m.titulo,
        cuenta: nombrePorCuenta[m.cuenta_id] || '—',
        total: 0,
        ejemplos: [],
      };
    });
    (preguntasIA || []).forEach((p) => {
      const info = infoPorCurso[p.microcurso_id];
      if (!info) return;
      info.total++;
      if (info.ejemplos.length < 3) info.ejemplos.push(p.pregunta);
    });

    const gapsConocimiento = Object.entries(infoPorCurso)
      .map(([microcurso_id, info]) => ({ microcurso_id, ...info }))
      .filter((g) => g.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    return new Response(JSON.stringify({ resumen, clientes, riesgos, gapsConocimiento }), {
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
