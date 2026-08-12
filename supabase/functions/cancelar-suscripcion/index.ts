// Inductoria · Edge Function: cancelar-suscripcion
// --------------------------------------------------
// Permite al dueño cancelar su propia suscripcion activa desde la app.
// Requiere estar logueado (Verify JWT SI debe estar activo para esta
// funcion, a diferencia del webhook). Solo cancela si la cuenta que
// pide la baja es la dueña de la suscripcion.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Identificar al usuario logueado a partir del JWT que mando.
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: cuenta, error: cuentaError } = await supabase
      .from('cuentas')
      .select('id, plan, mp_preapproval_id')
      .eq('owner_id', userData.user.id)
      .maybeSingle();

    if (cuentaError || !cuenta) {
      return new Response(JSON.stringify({ error: 'Cuenta no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (cuenta.plan !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Solo se puede cancelar una suscripción activa' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!cuenta.mp_preapproval_id) {
      return new Response(
        JSON.stringify({ error: 'Esta cuenta no tiene una suscripción de MercadoPago asociada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')!;
    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${cuenta.mp_preapproval_id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${mpToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'cancelled' }),
    });

    if (!mpRes.ok) {
      const detalle = await mpRes.text();
      console.error('Error cancelando en MercadoPago:', detalle);
      return new Response(
        JSON.stringify({ error: 'No se pudo cancelar en MercadoPago', detalle }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No hace falta esperar al webhook para reflejarlo: lo marcamos
    // nosotros mismos ya (el webhook lo va a confirmar igual después,
    // sin pisar nada raro porque el estado destino es el mismo).
    await supabase
      .from('cuentas')
      .update({ plan: 'cancelled' })
      .eq('id', cuenta.id);

    return new Response(JSON.stringify({ ok: true }), {
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
