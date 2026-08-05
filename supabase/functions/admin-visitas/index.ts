// Inductoria · Edge Function: admin-visitas
// ---------------------------------------------
// Totales de visitas (landing y app) para el panel de Admin. Solo el admin.

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

    const { data: visitas, error } = await supabase
      .from('landing_visitas')
      .select('created_at, origen')
      .order('created_at', { ascending: false })
      .limit(20000);

    if (error) throw error;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const contadores = {
      landing: { total: 0, hoy: 0, mes: 0 },
      app: { total: 0, hoy: 0, mes: 0 },
    };

    const porDiaMapa: Record<string, { landing: number; app: number }> = {};

    (visitas || []).forEach((v) => {
      const origen = v.origen === 'app' ? 'app' : 'landing';
      const fecha = new Date(v.created_at);

      contadores[origen].total++;
      if (fecha >= hoy) contadores[origen].hoy++;
      if (fecha >= inicioMes) contadores[origen].mes++;

      const clave = fecha.toISOString().slice(0, 10);
      if (!porDiaMapa[clave]) porDiaMapa[clave] = { landing: 0, app: 0 };
      porDiaMapa[clave][origen]++;
    });

    const porDia = Object.entries(porDiaMapa)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 14)
      .map(([fecha, cantidades]) => ({
        fecha,
        landing: cantidades.landing,
        app: cantidades.app,
        total: cantidades.landing + cantidades.app,
      }));

    return new Response(
      JSON.stringify({
        landing: contadores.landing,
        app: contadores.app,
        total: {
          total: contadores.landing.total + contadores.app.total,
          hoy: contadores.landing.hoy + contadores.app.hoy,
          mes: contadores.landing.mes + contadores.app.mes,
        },
        porDia,
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
