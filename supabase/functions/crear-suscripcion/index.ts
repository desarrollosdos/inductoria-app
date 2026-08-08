// Inductoria · Edge Function: crear-suscripcion
// ------------------------------------------------
// Crea la suscripción (preapproval) en MercadoPago cuando el dueño
// hace clic en "Suscribirme". El precio se calcula igual que en
// Suscripcion.jsx: precio_base configurable desde Admin, con las
// mismas proporciones por volumen de src/lib/precio.js (duplicadas
// acá porque las Edge Functions no pueden importar directo desde
// src/lib — si alguna vez cambian las proporciones, hay que tocar
// los dos lugares).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mismos tiers y proporciones que src/lib/precio.js
const TIERS_PRECIO = [
  { hasta: 1, factor: 12000 / 12000 },
  { hasta: 4, factor: 10000 / 12000 },
  { hasta: 9, factor: 9000 / 12000 },
  { hasta: Infinity, factor: 8000 / 12000 },
];

function precioTotalMensual(cantidadSucursales: number, precioBase: number): number {
  const tier = TIERS_PRECIO.find((t) => cantidadSucursales <= t.hasta)!;
  const precioPorSucursal = Math.round((precioBase * tier.factor) / 100) * 100;
  return precioPorSucursal * cantidadSucursales;
}

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

    const body = await req.json();
    const cuentaId = body.cuenta_id;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas')
      .select('*')
      .eq('id', cuentaId)
      .single();

    if (cuentaError || !cuenta || cuenta.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Cuenta no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { count: negociosCount } = await supabase
      .from('negocios')
      .select('*', { count: 'exact', head: true })
      .eq('cuenta_id', cuentaId);

    const cantidadSucursales = Math.max(negociosCount || 1, cuenta.sucursales_contratadas || 1);

    // Precio base configurable desde Admin, mismo que lee Suscripcion.jsx.
    const { data: configPrecio } = await supabase
      .from('configuracion_precio')
      .select('precio_base')
      .eq('id', 1)
      .maybeSingle();

    const precioBase = configPrecio?.precio_base || 12000;
    const monto = precioTotalMensual(cantidadSucursales, precioBase);

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')!;
    const appUrl = Deno.env.get('APP_URL') || 'https://app.inductoria.com.ar';

    const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpToken}`,
      },
      body: JSON.stringify({
        reason: `Inductoria - ${cuenta.nombre}`,
        external_reference: cuentaId,
        payer_email: user.email,
        back_url: `${appUrl}/suscripcion`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: monto,
          currency_id: 'ARS',
        },
        status: 'pending',
      }),
    });

    if (!mpRes.ok) {
      const errText = await mpRes.text();
      console.error('Error de MercadoPago:', errText);
      return new Response(JSON.stringify({ error: 'No se pudo crear la suscripción' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mpData = await mpRes.json();

    await supabase
      .from('cuentas')
      .update({ mp_preapproval_id: mpData.id })
      .eq('id', cuentaId);

    return new Response(JSON.stringify({ init_point: mpData.init_point }), {
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
