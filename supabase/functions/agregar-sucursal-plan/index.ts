// Inductoria · Edge Function: agregar-sucursal-plan
// ------------------------------------------------
// Permite al dueño sumar una sucursal más a su plan pago actual, sin
// escribirnos. Sube en 1 el número de sucursales contratadas, recalcula
// el precio (misma escala de src/lib/precio.js) y actualiza el monto
// de la suscripción en MercadoPago vía PUT /preapproval/{id} (mismo
// endpoint que ya usa cancelar-suscripcion, cambiando el campo que se
// manda: acá auto_recurring.transaction_amount en vez de status).
// Recién si eso sale bien guardamos el nuevo sucursales_contratadas, así
// nunca queda desincronizado de lo que realmente se le está cobrando al
// Cliente.
//
// Solo para cuenta.plan === 'active' y sin cancelacion_pendiente. Para
// trial no hace falta pasar por acá: el trial no tiene tope de
// sucursales (ver acceso.js / acceso.ts). Para past_due/suspended/
// cancelled no tiene sentido subir el monto de un cobro que ya está
// fallando o que no existe: se le sigue pidiendo a la persona que se
// contacte, como hasta ahora (mensaje que arma el frontend).
//
// OJO: el aumento de monto en MercadoPago aplica recién en el próximo
// cobro (no recalcula ni cobra la diferencia del período ya pagado),
// así que el frontend avisa "desde tu próximo cobro" en vez de prometer
// un cambio inmediato.

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
      .select('id, plan, cancelacion_pendiente, sucursales_contratadas, mp_preapproval_id')
      .eq('owner_id', userData.user.id)
      .maybeSingle();

    if (cuentaError || !cuenta) {
      return new Response(JSON.stringify({ error: 'Cuenta no encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (cuenta.plan !== 'active' || cuenta.cancelacion_pendiente) {
      return new Response(
        JSON.stringify({
          error: 'Solo se puede agregar una sucursal a un plan activo (sin cancelación pendiente)',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!cuenta.mp_preapproval_id) {
      return new Response(
        JSON.stringify({ error: 'Esta cuenta no tiene una suscripción de MercadoPago asociada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { count: negociosCount } = await supabase
      .from('negocios')
      .select('*', { count: 'exact', head: true })
      .eq('cuenta_id', cuenta.id);

    // Mismo criterio que crear-suscripcion: la cantidad "real" es el
    // máximo entre lo ya cargado y lo contratado (por si algún día
    // sucursales_contratadas queda por delante de negocios.length).
    const cantidadActual = Math.max(negociosCount || 1, cuenta.sucursales_contratadas || 1);
    const cantidadNueva = cantidadActual + 1;

    // Precio base configurable desde Admin, mismo que lee Suscripcion.jsx.
    const { data: configPrecio } = await supabase
      .from('configuracion_precio')
      .select('precio_base')
      .eq('id', 1)
      .maybeSingle();

    const precioBase = configPrecio?.precio_base || 12000;
    const montoNuevo = precioTotalMensual(cantidadNueva, precioBase);

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')!;

    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${cuenta.mp_preapproval_id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${mpToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auto_recurring: {
          transaction_amount: montoNuevo,
          currency_id: 'ARS',
        },
      }),
    });

    if (!mpRes.ok) {
      const detalle = await mpRes.text();
      console.error('Error actualizando monto en MercadoPago:', detalle);
      return new Response(
        JSON.stringify({ error: 'No se pudo actualizar la suscripción en MercadoPago', detalle }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Recién ahora que MercadoPago confirmó el nuevo monto, guardamos el
    // nuevo cupo. Si esto fallara acá, quedaría el monto ya subido en
    // MercadoPago pero el cupo viejo en Supabase — más seguro que al
    // revés (nunca cobrar de más sin haber subido el cupo primero).
    await supabase
      .from('cuentas')
      .update({ sucursales_contratadas: cantidadNueva })
      .eq('id', cuenta.id);

    return new Response(
      JSON.stringify({ ok: true, sucursales_contratadas: cantidadNueva, monto_mensual: montoNuevo }),
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
