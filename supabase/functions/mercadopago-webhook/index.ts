// Inductoria · Edge Function: mercadopago-webhook
// ------------------------------------------------
// Recibe las notificaciones de MercadoPago y actualiza cuentas.plan.
// Verifica la firma x-signature, mismo mecanismo que en Repunte.
//
// MercadoPago manda al menos dos familias de eventos relevantes:
// - "preapproval" / "subscription_preapproval": la suscripcion en si
//   cambia de estado (autorizada, pausada, cancelada). Se dispara una
//   vez por cada cambio de estado, no en cada pago.
// - "payment" / "subscription_authorized_payment": un pago puntual
//   DENTRO de una suscripcion ya autorizada (el cobro mensual). Se
//   dispara cada vez que se cobra, y es el unico evento que llega en
//   los pagos recurrentes despues del primero.
// Hay que procesar los dos, si no, la cuenta solo se activa la
// primera vez y nunca mas se entera de los cobros siguientes.
//
// Esta función NO debe pedir JWT de usuario (la llama MercadoPago, no
// alguien logueado), así que "Verify JWT" tiene que estar DESACTIVADO
// para esta función en el dashboard de Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
};

async function verificarFirma(req: Request, dataId: string): Promise<boolean> {
  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');
  const secret = Deno.env.get('MP_WEBHOOK_SECRET');

  if (!xSignature || !secret) return false;

  const partes = xSignature.split(',').reduce((acc: Record<string, string>, parte) => {
    const [k, v] = parte.split('=');
    acc[k.trim()] = v?.trim();
    return acc;
  }, {});

  const ts = partes['ts'];
  const hash = partes['v1'];
  if (!ts || !hash) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest));
  const firmaHex = Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return firmaHex === hash;
}

// Devuelve null para estados que no reconocemos explícitamente (por
// ejemplo 'pending', el estado con el que crear-suscripcion arma el
// preapproval ANTES de que el dueño termine de pagar en MercadoPago).
// Antes esto devolvía 'inactive' por default, lo que pisaba mal el
// plan real de la cuenta (trial vigente, o incluso active en una
// renovación) apenas alguien apretaba "Suscribirme", mucho antes de
// que el pago se acredite. Ahora, si no reconocemos el estado, no
// tocamos nada — dejamos que el pago (evento "payment") o un cambio de
// estado real (authorized/paused) sean los que actualicen.
//
// 'cancelled' NO pasa por acá — se maneja aparte más abajo, porque a
// diferencia de los demás no debe tocar el plan directamente (el
// Cliente mantiene acceso hasta el final de su período ya pagado, ver
// el comentario grande en cancelar-suscripcion/index.ts).
function mapearEstadoPreapproval(mpStatus: string): string | null {
  if (mpStatus === 'authorized') return 'active';
  if (mpStatus === 'paused') return 'past_due';
  return null;
}

const TIPOS_PREAPPROVAL = new Set(['preapproval', 'subscription_preapproval']);
const TIPOS_PAGO = new Set(['payment', 'subscription_authorized_payment']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const dataId = url.searchParams.get('data.id') || url.searchParams.get('id');
    const tipo = url.searchParams.get('type') || url.searchParams.get('topic');

    if (!dataId || !tipo) {
      return new Response('ok', { headers: corsHeaders });
    }

    const esPreapproval = TIPOS_PREAPPROVAL.has(tipo);
    const esPago = TIPOS_PAGO.has(tipo);

    if (!esPreapproval && !esPago) {
      // Cualquier otro tipo de evento lo ignoramos por ahora.
      return new Response('ok', { headers: corsHeaders });
    }

    const firmaValida = await verificarFirma(req, dataId);
    if (!firmaValida) {
      console.warn('mercadopago-webhook: firma inválida');
      return new Response(JSON.stringify({ error: 'Firma inválida' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (esPreapproval) {
      // Cambio de estado de la suscripcion en si.
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      if (!mpRes.ok) {
        console.error('No se pudo consultar el preapproval en MercadoPago');
        return new Response('ok', { headers: corsHeaders });
      }
      const preapproval = await mpRes.json();
      const cuentaId = preapproval.external_reference;

      // Guardia contra suscripciones duplicadas (por ejemplo, las que
      // quedan sueltas de pruebas o de reintentos): si este aviso es
      // sobre un preapproval que YA NO es el que la cuenta tiene
      // guardado como el vigente, lo ignoramos. Sin esto, cancelar a
      // mano una suscripción vieja/duplicada en MercadoPago terminaba
      // marcando la cuenta real como "cancelación pendiente", aunque su
      // suscripción de verdad siguiera activa y sin tocar.
      //
      // Excepción: si la cuenta todavía no tiene ningún
      // mp_preapproval_id guardado, o el evento es 'authorized' (una
      // suscripción que se autoriza de verdad, incluyendo el caso
      // normal de la primera vez), sí lo procesamos.
      const { data: cuentaActual } = await supabase
        .from('cuentas')
        .select('mp_preapproval_id')
        .eq('id', cuentaId)
        .maybeSingle();

      if (
        cuentaActual?.mp_preapproval_id &&
        cuentaActual.mp_preapproval_id !== dataId &&
        preapproval.status !== 'authorized'
      ) {
        console.warn(
          `mercadopago-webhook: ignorando evento de preapproval ${dataId} (no es el vigente ${cuentaActual.mp_preapproval_id}) para cuenta ${cuentaId}`
        );
        return new Response('ok', { headers: corsHeaders });
      }

      if (preapproval.status === 'cancelled') {
        // No cortamos el acceso al toque: el Cliente sigue con acceso
        // hasta next_payment_date (el período que ya pagó). Cubre tanto
        // cancelaciones hechas desde nuestro botón (cancelar-suscripcion
        // ya seteó esto mismo, así que este update es idempotente) como
        // cancelaciones hechas directo desde la cuenta de MercadoPago
        // del Cliente, que no pasan por nuestra app.
        const accesoHasta =
          preapproval.next_payment_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from('cuentas')
          .update({ cancelacion_pendiente: true, acceso_hasta: accesoHasta, mp_preapproval_id: dataId })
          .eq('id', cuentaId);
      } else {
        const nuevoPlan = mapearEstadoPreapproval(preapproval.status);

        if (nuevoPlan) {
          // Si el estado vuelve a authorized/paused (por ejemplo, una
          // nueva suscripción después de haber cancelado la anterior),
          // limpiamos cualquier cancelación pendiente que hubiera
          // quedado de antes.
          await supabase
            .from('cuentas')
            .update({
              plan: nuevoPlan,
              mp_preapproval_id: dataId,
              cancelacion_pendiente: false,
              acceso_hasta: null,
            })
            .eq('id', cuentaId);
        } else {
          // Estado no reconocido (ej: 'pending'): igual guardamos el
          // mp_preapproval_id para no perderlo, pero sin tocar el plan.
          await supabase.from('cuentas').update({ mp_preapproval_id: dataId }).eq('id', cuentaId);
        }
      }
    } else if (esPago) {
      // Un pago puntual dentro de la suscripcion (el cobro mensual).
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      if (!mpRes.ok) {
        console.error('No se pudo consultar el pago en MercadoPago');
        return new Response('ok', { headers: corsHeaders });
      }
      const pago = await mpRes.json();
      const cuentaId = pago.external_reference;

      if (!cuentaId) {
        console.warn('Pago sin external_reference, no se puede asociar a una cuenta', dataId);
        return new Response('ok', { headers: corsHeaders });
      }

      if (pago.status === 'approved') {
        await supabase
          .from('cuentas')
          .update({ plan: 'active', cancelacion_pendiente: false, acceso_hasta: null })
          .eq('id', cuentaId);
      }
      // Si el pago rechaza, no tocamos el plan aca: el evento de
      // preapproval (paused/cancelled) es el que maneja esos casos.
    }

    return new Response('ok', { headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Error inesperado', detalle: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
