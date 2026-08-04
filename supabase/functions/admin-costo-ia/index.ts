// Inductoria · Edge Function: admin-costo-ia
// ---------------------------------------------
// Devuelve el costo real de IA (tokens reales, no estimado) acumulado,
// total y del mes en curso, y desglosado por cuenta. Solo el admin.

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

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (user.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: registros, error } = await supabase
      .from('ai_usage_log')
      .select('cuenta_id, costo_usd, created_at, cuentas(nombre)');

    if (error) throw error;

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    let totalUsd = 0;
    let totalUsdMes = 0;
    let generaciones = 0;
    const porCuentaMapa = {};

    (registros || []).forEach((r) => {
      const costo = Number(r.costo_usd) || 0;
      totalUsd += costo;
      generaciones += 1;
      if (new Date(r.created_at) >= inicioMes) {
        totalUsdMes += costo;
      }
      const clave = r.cuenta_id || 'sin_cuenta';
      const nombre = r.cuentas?.nombre || 'Cuenta eliminada';
      if (!porCuentaMapa[clave]) {
        porCuentaMapa[clave] = { nombre, usd: 0, generaciones: 0 };
      }
      porCuentaMapa[clave].usd += costo;
      porCuentaMapa[clave].generaciones += 1;
    });

    const porCuenta = Object.values(porCuentaMapa).sort((a, b) => b.usd - a.usd);

    return new Response(
      JSON.stringify({ totalUsd, totalUsdMes, generaciones, porCuenta }),
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
