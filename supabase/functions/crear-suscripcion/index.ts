// Inductoria · Edge Function: crear-suscripcion
// ------------------------------------------------
// Crea la suscripción (preapproval) en MercadoPago cuando el dueño
// hace clic en "Suscribirme" (o "Pagar con otra tarjeta" si tiene el
// pago trabado). El precio se calcula igual que en Suscripcion.jsx:
// precio_base configurable desde Admin, con las mismas proporciones por
// volumen de src/lib/precio.js (duplicadas acá porque las Edge Functions
// no pueden importar directo desde src/lib; si alguna vez cambian las
// proporciones, hay que tocar los dos lugares).
//
// A proposito NO se manda payer_email a MercadoPago: si se manda,
// MercadoPago exige que la cuenta de MercadoPago que paga tenga
// exactamente ese mail, y no nos importa que coincida con el mail
// de la cuenta de Inductoria, solo que se pague.
//
// Ajuste 2026-09-24 (suscripciones dobles):
// - Si la cuenta ya está activa y sin cancelación pendiente, no dejamos
//   crear otra suscripción (409): se le cobraría dos veces.
// - Si la cuenta ya tenía un mp_preapproval_id (pago trabado, checkout
//   abandonado, suscripción cancelada), creamos la nueva, guardamos su
//   id y RECIÉN AHÍ cancelamos la vieja en MercadoPago. El orden importa:
//   el webhook ignora los avisos de preapprovals que no son el guardado
//   en la cuenta, así que el "cancelled" de la vieja llega cuando la
//   cuenta ya apunta a la nueva y no la marca como cancelada.
// - Si no se puede cancelar la vieja, cancelamos la nueva, volvemos a
//   dejar el id viejo y devolvemos error: preferimos que reintente a que
//   queden dos suscripciones cobrando.
// - Si la vieja figura 'authorized' y la cuenta todavía no está activa
//   (trial/inactive/cancelled), es casi seguro que el pago se acaba de
//   hacer y el webhook todavía no llegó: no la cancelamos (sería
//   cancelar una suscripción recién pagada) y le pedimos que espere.

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

// Mismo valor por defecto que precio-publico, agregar-sucursal-plan y
// PRECIO_BASE_POR_DEFECTO en src/lib/precio.js.
const PRECIO_BASE_POR_DEFECTO = 12000;

function precioTotalMensual(cantidadSucursales: number, precioBase: number): number {
  const tier = TIERS_PRECIO.find((t) => cantidadSucursales <= t.hasta)!;
  const precioPorSucursal = Math.round((precioBase * tier.factor) / 100) * 100;
  return precioPorSucursal * cantidadSucursales;
}

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const MP_API = 'https://api.mercadopago.com';

interface InfoPreapproval {
  status: string | null;
  date_created: string | null;
}

// Lee un preapproval. null si no se pudo leer.
async function leerPreapproval(id: string, mpToken: string): Promise<InfoPreapproval | null> {
  try {
    const res = await fetch(`${MP_API}/preapproval/${id}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!res.ok) {
      console.error(`crear-suscripcion: no se pudo leer el preapproval ${id} (HTTP ${res.status})`);
      return null;
    }
    const data = await res.json();
    return {
      status: typeof data?.status === 'string' ? data.status : null,
      date_created: typeof data?.date_created === 'string' ? data.date_created : null,
    };
  } catch (err) {
    console.error(`crear-suscripcion: error leyendo el preapproval ${id}`, err);
    return null;
  }
}

async function leerEstadoPreapproval(id: string, mpToken: string): Promise<string | null> {
  return (await leerPreapproval(id, mpToken))?.status ?? null;
}

// Un preapproval autorizado hace menos de esto se considera "recién
// pagado": el webhook puede no haber llegado todavía.
const MINUTOS_PAGO_RECIENTE = 30;

// Cancela un preapproval. Si MercadoPago rechaza el PUT (por ejemplo
// porque ya estaba cancelado), lo volvemos a leer: si ya figura
// cancelado, para nosotros es un éxito.
async function cancelarPreapproval(id: string, mpToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${MP_API}/preapproval/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    if (res.ok) return true;
    console.warn(
      `crear-suscripcion: PUT cancelled del preapproval ${id} devolvió HTTP ${res.status}: ${await res.text()}`
    );
  } catch (err) {
    console.error(`crear-suscripcion: error cancelando el preapproval ${id}`, err);
  }
  return (await leerEstadoPreapproval(id, mpToken)) === 'cancelled';
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
      return responder({ error: 'No autorizado' }, 401);
    }

    const body = await req.json().catch(() => ({}));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Si el frontend manda cuenta_id lo usamos (y verificamos que sea
    // suya); si no, buscamos la cuenta del usuario logueado.
    const consultaCuenta = supabase.from('cuentas').select('*');
    const { data: cuenta, error: cuentaError } = body?.cuenta_id
      ? await consultaCuenta.eq('id', body.cuenta_id).maybeSingle()
      : await consultaCuenta.eq('owner_id', user.id).maybeSingle();

    if (cuentaError || !cuenta || cuenta.owner_id !== user.id) {
      return responder({ error: 'No encontramos tu cuenta.' }, 404);
    }
    const cuentaId: string = cuenta.id;

    // Ya paga y no canceló: otra suscripción sería un cobro doble.
    if (cuenta.plan === 'active' && !cuenta.cancelacion_pendiente) {
      return responder(
        { error: 'Tu suscripción ya está activa, no hace falta que te suscribas de nuevo.' },
        409
      );
    }

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')!;
    const appUrl = Deno.env.get('APP_URL') || 'https://app.inductoria.com.ar';
    const idAnterior: string | null = cuenta.mp_preapproval_id || null;

    if (idAnterior) {
      const anterior = await leerPreapproval(idAnterior, mpToken);
      const creadoMs = anterior?.date_created ? new Date(anterior.date_created).getTime() : NaN;
      const recienCreado =
        Number.isFinite(creadoMs) && Date.now() - creadoMs < MINUTOS_PAGO_RECIENTE * 60 * 1000;
      // Autorizado y la cuenta todavía no pasó a activa: el pago se hizo y
      // falta el webhook. Lo mismo si con el pago trabado ya pagó con otra
      // tarjeta hace un rato (preapproval autorizado recién creado): no
      // hay que cancelar esa suscripción nueva que acaba de cobrar.
      if (
        anterior?.status === 'authorized' &&
        ((['trial', 'inactive', 'cancelled'].includes(cuenta.plan) && !cuenta.cancelacion_pendiente) ||
          recienCreado)
      ) {
        console.warn(
          `crear-suscripcion: cuenta ${cuentaId} (plan ${cuenta.plan}) ya tiene el preapproval ${idAnterior} autorizado; no creo otro`
        );
        return responder(
          {
            error:
              'Ya tenés un pago hecho en Mercado Pago que se está acreditando. Esperá unos minutos y actualizá esta página. Si no se activa, escribinos.',
          },
          409
        );
      }
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

    const precioBase = configPrecio?.precio_base || PRECIO_BASE_POR_DEFECTO;
    const monto = precioTotalMensual(cantidadSucursales, precioBase);

    const mpRes = await fetch(`${MP_API}/preapproval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpToken}`,
      },
      body: JSON.stringify({
        reason: `Inductoria - ${cuenta.nombre}`,
        external_reference: cuentaId,
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
      console.error('crear-suscripcion: error de MercadoPago al crear el preapproval:', errText);
      return responder({ error: 'No pudimos armar el pago en Mercado Pago. Probá de nuevo en un momento.' }, 502);
    }

    const mpData = await mpRes.json();
    const idNuevo: string = mpData.id;

    // 1) Guardamos el id nuevo ANTES de tocar el viejo (ver arriba).
    const { error: errorGuardar } = await supabase
      .from('cuentas')
      .update({ mp_preapproval_id: idNuevo })
      .eq('id', cuentaId);

    if (errorGuardar) {
      console.error(`crear-suscripcion: no se pudo guardar el preapproval ${idNuevo} en la cuenta ${cuentaId}`, errorGuardar);
      await cancelarPreapproval(idNuevo, mpToken);
      return responder({ error: 'No pudimos guardar tu suscripción. Probá de nuevo en un momento.' }, 500);
    }

    // 2) Cancelamos el viejo, si había uno distinto.
    if (idAnterior && idAnterior !== idNuevo) {
      const canceladoAnterior = await cancelarPreapproval(idAnterior, mpToken);
      if (!canceladoAnterior) {
        console.error(
          `crear-suscripcion: no se pudo cancelar el preapproval anterior ${idAnterior} de la cuenta ${cuentaId}; deshago el nuevo ${idNuevo}`
        );
        const canceladoNuevo = await cancelarPreapproval(idNuevo, mpToken);
        if (!canceladoNuevo) {
          console.error(
            `crear-suscripcion: ATENCIÓN, tampoco se pudo cancelar el nuevo ${idNuevo} (cuenta ${cuentaId}). Revisar a mano en MercadoPago.`
          );
        }
        await supabase.from('cuentas').update({ mp_preapproval_id: idAnterior }).eq('id', cuentaId);
        return responder(
          {
            error:
              'No pudimos dar de baja tu suscripción anterior en Mercado Pago, así que frenamos acá para que no te cobren dos veces. Probá de nuevo en unos minutos.',
          },
          502
        );
      }
      console.log(`crear-suscripcion: cuenta ${cuentaId} pasó del preapproval ${idAnterior} al ${idNuevo}`);
    }

    return responder({ init_point: mpData.init_point });
  } catch (err) {
    console.error(err);
    return responder({ error: 'Error inesperado', detalle: String(err) }, 500);
  }
});
