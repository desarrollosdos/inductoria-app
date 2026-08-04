// Inductoria · Edge Function: admin-visitas
// ---------------------------------------------
// Totales de visitas a la landing para el panel de Admin. Solo el admin.

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
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(20000);

    if (error) throw error;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    let visitasHoy = 0;
    let visitasMes = 0;
    const porDiaMapa: Record<string, number> = {};

    (visitas || []).forEach((v) => {
      const fecha = new Date(v.created_at);
      if (fecha >= hoy) visitasHoy++;
      if (fecha >= inicioMes) visitasMes++;

      const clave = fecha.toISOString().slice(0, 10);
      porDiaMapa[clave] = (porDiaMapa[clave] || 0) + 1;
    });

    const porDia = Object.entries(porDiaMapa)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 14)
      .map(([fecha, cantidad]) => ({ fecha, cantidad }));

    return new Response(
      JSON.stringify({
        total: (visitas || []).length,
        hoy: visitasHoy,
        mes: visitasMes,
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
