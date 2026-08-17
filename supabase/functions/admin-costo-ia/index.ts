// Inductoria · Edge Function: admin-costo-ia
// ---------------------------------------------
// Devuelve el costo real de IA (tokens reales, no estimado) acumulado,
// total y del mes en curso, y desglosado por cuenta. Solo el admin.
//
// También devuelve estadísticas de transcripción de audio (Groq): no es
// costo real en USD (Groq es gratis dentro de su límite diario), pero
// desde que se habilitó en trial (2026-08-17) sirve tener visibilidad
// del volumen acá, por si algún día conviene revisar si sigue siendo
// gratis a esa escala.

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

    // Estadísticas de transcripción de audio (Groq), separado del costo
    // real de arriba porque no tiene costo en USD.
    const { data: audios, error: errorAudios } = await supabase
      .from('audio_transcripciones_log')
      .select('plan_al_momento, created_at');

    if (errorAudios) throw errorAudios;

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    let audioTotal = 0;
    let audioHoy = 0;
    let audioMes = 0;
    let audioTrial = 0;

    (audios || []).forEach((a) => {
      audioTotal += 1;
      const fecha = new Date(a.created_at);
      if (fecha >= inicioMes) audioMes += 1;
      if (fecha >= inicioHoy) audioHoy += 1;
      if (a.plan_al_momento === 'trial') audioTrial += 1;
    });

    return new Response(
      JSON.stringify({
        totalUsd,
        totalUsdMes,
        generaciones,
        porCuenta,
        audio: { total: audioTotal, hoy: audioHoy, mes: audioMes, enTrial: audioTrial },
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
