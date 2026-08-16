// Inductoria · Edge Function: expirar-trials
// ------------------------------------------------
// Corre todos los días vía pg_cron (ver supabase/sql/2026-08-16-trial.sql).
// Busca cuentas en plan='trial' cuyo trial_ends_at ya pasó y las pasa a
// 'inactive' — el mismo estado que ya usa toda la app para "sin acceso,
// necesita suscribirse" (Suscripcion.jsx, Dashboard.jsx, Empleados.jsx,
// Contenido.jsx), así que no hace falta ningún manejo especial nuevo en
// el frontend para la cuenta vencida.
//
// Protegida con un secret (x-cron-secret) para que no la pueda llamar
// cualquiera desde afuera y tirar cuentas a 'inactive' a mano. Mismo
// criterio que los cron jobs de Repunte.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const secretEsperado = Deno.env.get('CRON_SECRET');
  const secretRecibido = req.headers.get('x-cron-secret');

  if (!secretEsperado || secretRecibido !== secretEsperado) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: vencidas, error } = await supabase
      .from('cuentas')
      .update({ plan: 'inactive' })
      .eq('plan', 'trial')
      .lt('trial_ends_at', new Date().toISOString())
      .select('id');

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, cuentas_vencidas: (vencidas || []).length }), {
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
