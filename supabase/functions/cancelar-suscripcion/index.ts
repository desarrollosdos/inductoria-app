// Inductoria · Edge Function: cancelar-suscripcion
// --------------------------------------------------
// Permite al dueño cancelar su propia suscripcion activa desde la app.
// Requiere estar logueado (Verify JWT SI debe estar activo para esta
// funcion, a diferencia del webhook). Solo cancela si la cuenta que
// pide la baja es la dueña de la suscripcion.
//
// Igual que cualquier suscripción tipo SaaS (Netflix, Spotify, etc.):
// cancelar corta la RENOVACIÓN automática, pero el acceso sigue activo
// hasta el final del período ya pagado (esto es lo que ya prometía
// CancelarSuscripcionModal.jsx en el frontend — "vas a perder acceso al
// final de tu período ya pagado" — pero antes el código de acá abajo no
// lo cumplía: cortaba el acceso al toque). Por eso NO tocamos
// cuentas.plan acá: lo dejamos en 'active' y guardamos hasta cuándo
// tiene acceso en acceso_hasta + marcamos cancelacion_pendiente. Un
// cron diario (expirar-trials, que ya corre todos los días) es el que
// después, cuando esa fecha ya pasó, recién ahí pasa el plan a
// 'cancelled'.

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

    // Antes de cancelar, leemos next_payment_date: es la fecha en la
    // que MercadoPago iba a cobrar el próximo período. Como el período
    // actual ya está pagado, esa fecha es hasta cuándo le corresponde
    // acceso al Cliente. La leemos ANTES del PUT porque una vez
    // cancelada la suscripción, MercadoPago puede dejar de informarla.
    const getRes = await fetch(`https://api.mercadopago.com/preapproval/${cuenta.mp_preapproval_id}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    let accesoHasta: string | null = null;
    if (getRes.ok) {
      const preapproval = await getRes.json();
      if (preapproval.next_payment_date) {
        accesoHasta = preapproval.next_payment_date;
      }
    }
    // Si por algún motivo MercadoPago no informó next_payment_date
    // (no debería pasar en una suscripción autorizada, pero por las
    // dudas), usamos 30 días desde ahora como aproximación de un
    // período mensual — preferimos ser generosos con el Cliente antes
    // que cortarle el acceso de golpe por un dato faltante.
    if (!accesoHasta) {
      console.warn(
        `cancelar-suscripcion: preapproval ${cuenta.mp_preapproval_id} sin next_payment_date, uso fallback de 30 días`
      );
      accesoHasta = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

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

    // OJO: plan queda como estaba ('active'). No lo tocamos acá — el
    // Cliente sigue con acceso normal hasta acceso_hasta. El webhook
    // de MercadoPago también va a recibir este cambio de estado, pero
    // ya sabe (ver mercadopago-webhook) que un preapproval 'cancelled'
    // tampoco debe tocar el plan directamente, por la misma razón.
    await supabase
      .from('cuentas')
      .update({ cancelacion_pendiente: true, acceso_hasta: accesoHasta })
      .eq('id', cuenta.id);

    return new Response(JSON.stringify({ ok: true, acceso_hasta: accesoHasta }), {
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
