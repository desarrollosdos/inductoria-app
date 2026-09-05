// Inductoria · Edge Function: expirar-trials
// ------------------------------------------------
// Corre todos los días vía pg_cron (ver supabase/sql/2026-08-16-trial.sql).
// Hace tres cosas (el nombre quedó corto para lo segundo y lo tercero,
// pero se mantiene así para no tener que rearmar el cron job ya
// configurado):
//
// 1. Busca cuentas en plan='trial' cuyo trial_ends_at ya pasó y las pasa
//    a 'inactive' — el mismo estado que ya usa toda la app para "sin
//    acceso, necesita suscribirse" (Suscripcion.jsx, Dashboard.jsx,
//    Empleados.jsx, Contenido.jsx), así que no hace falta ningún manejo
//    especial nuevo en el frontend para la cuenta vencida.
//
// 2. Busca cuentas con cancelacion_pendiente=true cuyo acceso_hasta ya
//    pasó (canceladas por el Cliente o desde MercadoPago, pero que
//    mantuvieron acceso hasta el final de su período ya pagado — ver
//    cancelar-suscripcion/index.ts) y ahí sí las pasa a 'cancelled'.
//
// 3. (Agregado 2026-09-05) Busca cuentas en plan='past_due' cuyo
//    past_due_limite ya pasó (15 días de gracia desde que Mercado Pago
//    avisó el pago trabado — ver mercadopago-webhook/index.ts) y las
//    pasa a 'suspended'. Antes de esto, una cuenta con el pago fallido
//    se quedaba con acceso completo (incluida IA con costo real) sin
//    ningún límite de tiempo.
//
// Protegida con un secret (x-cron-secret) para que no la pueda llamar
// cualquiera desde afuera y tirar cuentas a 'inactive'/'cancelled'/
// 'suspended' a mano. Mismo criterio que los cron jobs de Repunte.

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

    const ahora = new Date().toISOString();

    const { data: trialsVencidos, error: errorTrials } = await supabase
      .from('cuentas')
      .update({ plan: 'inactive' })
      .eq('plan', 'trial')
      .lt('trial_ends_at', ahora)
      .select('id');

    if (errorTrials) throw errorTrials;

    const { data: cancelacionesAplicadas, error: errorCancelaciones } = await supabase
      .from('cuentas')
      .update({ plan: 'cancelled', cancelacion_pendiente: false })
      .eq('cancelacion_pendiente', true)
      .lt('acceso_hasta', ahora)
      .select('id');

    if (errorCancelaciones) throw errorCancelaciones;

    const { data: pastDueSuspendidos, error: errorPastDue } = await supabase
      .from('cuentas')
      .update({ plan: 'suspended', past_due_limite: null })
      .eq('plan', 'past_due')
      .lt('past_due_limite', ahora)
      .select('id');

    if (errorPastDue) throw errorPastDue;

    return new Response(
      JSON.stringify({
        ok: true,
        cuentas_vencidas: (trialsVencidos || []).length,
        cancelaciones_aplicadas: (cancelacionesAplicadas || []).length,
        past_due_suspendidos: (pastDueSuspendidos || []).length,
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
