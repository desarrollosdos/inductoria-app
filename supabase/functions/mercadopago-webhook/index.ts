// Inductoria · Edge Function: mercadopago-webhook
// ------------------------------------------------
// Recibe las notificaciones de MercadoPago y actualiza cuentas.plan.
// Verifica la firma x-signature, mismo mecanismo que en Repunte.
//
// Esta función NO debe pedir JWT de usuario (la llama MercadoPago, no
// alguien logueado), así que "Verify JWT" tiene que estar DESACTIVADO
// para esta función en el dashboard de Supabase.
//
// Eventos que procesamos (en el panel de MercadoPago tienen que estar
// activados los de "Planes y suscripciones"):
// - subscription_preapproval (o 'preapproval'): la suscripción en sí
//   cambia de estado (authorized, paused, cancelled, pending). Se lee con
//   GET /preapproval/{id}.
// - subscription_authorized_payment: cada cobro mensual. data.id es un
//   "authorized payment", NO un pago común: se lee con
//   GET /authorized_payments/{id}, que trae preapproval_id, status
//   (scheduled | processed | recycling | cancelled) y payment.status
//   (approved | rejected | ...). Antes esto se consultaba en
//   /v1/payments/{id}, que para estos ids no devuelve nada útil, así que
//   los cobros mensuales nunca se registraban, y los rechazos se
//   ignoraban directamente.
// - payment: pagos comunes. Solo los usamos si traen el id de la
//   suscripción y están aprobados (los rechazos llegan también por
//   subscription_authorized_payment, que siempre devuelve el estado final
//   del cobro y no se pisa con reintentos viejos).
//
// Reglas (2026-09-24):
// - Cobro rechazado, o el cobro entra en 'recycling' (MercadoPago lo está
//   reintentando), con la cuenta 'active': pasa a 'past_due' y arranca
//   el plazo de gracia de 15 días (past_due_limite). Pasado ese plazo,
//   el cron expirar-trials la pasa a 'suspended'.
// - Cobro aprobado con la cuenta en past_due / suspended / inactive /
//   trial: pasa a 'active' y se limpia el plazo de gracia.
// - Nunca reactivamos una cuenta que el usuario canceló
//   (cancelacion_pendiente, o plan 'cancelled') por un cobro aprobado,
//   salvo que la suscripción de ese cobro sea la guardada en la cuenta Y
//   siga autorizada hoy en MercadoPago. Una suscripción cancelada en
//   MercadoPago no vuelve a 'authorized', así que eso solo pasa si es una
//   suscripción NUEVA (crear-suscripcion guarda el id nuevo antes de que
//   se pague).
// - Preapproval 'authorized' solo activa cuentas en trial / inactive /
//   cancelled. No saca a una cuenta de 'past_due' ni de 'suspended': ahí
//   el problema fue un cobro fallido, y la cuenta vuelve a 'active'
//   recién cuando llega un cobro aprobado (no guardamos un historial de
//   cobros para poder decidirlo de otra forma).

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
};

const LOG = 'mercadopago-webhook:';
const MP_API = 'https://api.mercadopago.com';

// Dias de gracia en 'past_due' antes de pasar a 'suspended'. Numero de
// negocio, no tecnico: Roberto puede cambiarlo libremente.
const LIMITE_PAST_DUE_DIAS = 15;

function calcularLimitePastDue(): string {
  return new Date(Date.now() + LIMITE_PAST_DUE_DIAS * 24 * 60 * 60 * 1000).toISOString();
}

const TIPOS_PREAPPROVAL = new Set(['preapproval', 'subscription_preapproval']);
const TIPO_COBRO_SUSCRIPCION = 'subscription_authorized_payment';
const TIPO_PAGO = 'payment';

// Error de MercadoPago que conviene reintentar (5xx o red caída): lo
// devolvemos como 500 para que MercadoPago vuelva a mandar el aviso.
class ErrorReintentable extends Error {}

// ---------------------------------------------------------------
// Firma
// ---------------------------------------------------------------

// Comparación en tiempo constante (no corta en el primer carácter
// distinto), para no filtrar por tiempos cuánto de la firma coincide.
function igualesTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

async function hmacHex(secret: string, mensaje: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', key, encoder.encode(mensaje));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verificarFirma(req: Request, dataId: string): Promise<boolean> {
  const xSignature = req.headers.get('x-signature');
  // Si falta x-request-id usamos '' y no "null" (antes se colaba el
  // texto "null" en el manifest y la firma nunca coincidía).
  const xRequestId = req.headers.get('x-request-id') ?? '';
  const secret = Deno.env.get('MP_WEBHOOK_SECRET');

  if (!secret) {
    console.error(LOG, 'falta el secret MP_WEBHOOK_SECRET, rechazo todo');
    return false;
  }
  if (!xSignature) return false;

  const partes: Record<string, string> = {};
  for (const parte of xSignature.split(',')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    partes[parte.slice(0, i).trim()] = parte.slice(i + 1).trim();
  }

  const ts = partes['ts'];
  const hash = (partes['v1'] || '').toLowerCase();
  if (!ts || !hash) return false;

  // Según la documentación de MercadoPago, si el id es alfanumérico va
  // en minúsculas en el manifest.
  const idManifest = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;

  const manifests = [`id:${idManifest};request-id:${xRequestId};ts:${ts};`];
  // La documentación también dice que si falta un dato se saca esa parte
  // del manifest; probamos las dos formas para no rechazar avisos buenos.
  if (!xRequestId) manifests.push(`id:${idManifest};ts:${ts};`);

  let valida = false;
  for (const manifest of manifests) {
    const esperado = await hmacHex(secret, manifest);
    if (igualesTiempoConstante(esperado, hash)) valida = true;
  }
  return valida;
}

// ---------------------------------------------------------------
// MercadoPago
// ---------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function mpGet(path: string, mpToken: string): Promise<any | null> {
  let res: Response;
  try {
    res = await fetch(`${MP_API}${path}`, { headers: { Authorization: `Bearer ${mpToken}` } });
  } catch (err) {
    throw new ErrorReintentable(`no se pudo conectar con MercadoPago (${path}): ${String(err)}`);
  }
  if (res.status >= 500) {
    throw new ErrorReintentable(`MercadoPago respondió ${res.status} en ${path}`);
  }
  if (!res.ok) {
    console.error(LOG, `MercadoPago respondió ${res.status} en ${path}: ${await res.text()}`);
    return null;
  }
  return await res.json();
}

async function leerEstadoPreapproval(id: string, mpToken: string): Promise<string | null> {
  const pre = await mpGet(`/preapproval/${id}`, mpToken);
  return typeof pre?.status === 'string' ? pre.status : null;
}

interface CuentaWebhook {
  id: string;
  plan: string;
  mp_preapproval_id: string | null;
  cancelacion_pendiente: boolean | null;
  acceso_hasta: string | null;
  past_due_limite: string | null;
}

const COLUMNAS_CUENTA = 'id, plan, mp_preapproval_id, cancelacion_pendiente, acceso_hasta, past_due_limite';

async function actualizarCuenta(
  supabase: SupabaseClient,
  cuentaId: string,
  cambios: Record<string, unknown>,
  motivo: string
) {
  const { error } = await supabase.from('cuentas').update(cambios).eq('id', cuentaId);
  if (error) {
    // Si no pudimos guardar, que MercadoPago reintente.
    throw new ErrorReintentable(`no se pudo actualizar la cuenta ${cuentaId} (${motivo}): ${error.message}`);
  }
  console.log(LOG, `cuenta ${cuentaId}: ${motivo}`, JSON.stringify(cambios));
}

// ---------------------------------------------------------------
// Cambios de estado de la suscripción
// ---------------------------------------------------------------

async function procesarPreapproval(supabase: SupabaseClient, mpToken: string, dataId: string) {
  const preapproval = await mpGet(`/preapproval/${dataId}`, mpToken);
  if (!preapproval) return;

  const cuentaId = preapproval.external_reference;
  const estado: string = preapproval.status;
  if (!cuentaId) {
    console.warn(LOG, `preapproval ${dataId} (${estado}) sin external_reference, lo ignoro`);
    return;
  }

  const { data: cuenta } = await supabase
    .from('cuentas')
    .select(COLUMNAS_CUENTA)
    .eq('id', cuentaId)
    .maybeSingle<CuentaWebhook>();

  if (!cuenta) {
    console.warn(LOG, `preapproval ${dataId} (${estado}) apunta a la cuenta ${cuentaId}, que no existe`);
    return;
  }

  console.log(LOG, `preapproval ${dataId} está '${estado}', cuenta ${cuentaId} en plan '${cuenta.plan}'`);

  // Guardia contra suscripciones duplicadas: si este aviso es de un
  // preapproval que NO es el guardado en la cuenta, lo ignoramos. Así el
  // 'cancelled' de la suscripción vieja que reemplaza crear-suscripcion
  // no marca la cuenta como cancelada.
  const guardado = cuenta.mp_preapproval_id;
  if (guardado && guardado !== dataId) {
    if (estado !== 'authorized') {
      console.log(LOG, `ignoro: ${dataId} no es el preapproval vigente (${guardado}) de la cuenta ${cuentaId}`);
      return;
    }
    // Un preapproval autorizado que no es el guardado solo debería verse
    // en cuentas de antes de este cambio. Si el guardado también está
    // vivo, hay dos suscripciones cobrando: no tocamos nada y avisamos.
    const estadoGuardado = await leerEstadoPreapproval(guardado, mpToken);
    if (estadoGuardado === 'authorized') {
      console.error(
        LOG,
        `ATENCIÓN: la cuenta ${cuentaId} tiene dos suscripciones autorizadas (${guardado} guardada y ${dataId}). Revisar y cancelar una a mano en MercadoPago.`
      );
      return;
    }
    console.log(LOG, `adopto ${dataId} como vigente para la cuenta ${cuentaId} (el guardado ${guardado} está '${estadoGuardado}')`);
  }

  if (estado === 'authorized') {
    if (['trial', 'inactive', 'cancelled'].includes(cuenta.plan)) {
      await actualizarCuenta(
        supabase,
        cuentaId,
        {
          plan: 'active',
          mp_preapproval_id: dataId,
          cancelacion_pendiente: false,
          acceso_hasta: null,
          past_due_limite: null,
        },
        'suscripción autorizada, pasa a active'
      );
    } else if (cuenta.plan === 'active') {
      // Si tenía una cancelación pendiente y este preapproval sigue
      // autorizado hoy, es una suscripción nueva (una cancelada no vuelve
      // a authorized): la cancelación ya no corre.
      const cambios: Record<string, unknown> = {};
      if (guardado !== dataId) cambios.mp_preapproval_id = dataId;
      if (cuenta.cancelacion_pendiente) {
        cambios.cancelacion_pendiente = false;
        cambios.acceso_hasta = null;
      }
      if (Object.keys(cambios).length > 0) {
        await actualizarCuenta(supabase, cuentaId, cambios, 'suscripción autorizada sobre cuenta activa');
      }
    } else {
      // past_due / suspended: el problema fue un cobro. Guardamos el id,
      // pero la cuenta vuelve a 'active' recién con un cobro aprobado.
      if (guardado !== dataId) {
        await actualizarCuenta(supabase, cuentaId, { mp_preapproval_id: dataId }, 'guardo preapproval autorizado');
      }
      console.log(
        LOG,
        `cuenta ${cuentaId} sigue en '${cuenta.plan}': espera un cobro aprobado para volver a active`
      );
    }
    return;
  }

  if (estado === 'paused') {
    if (cuenta.plan === 'active' && !cuenta.cancelacion_pendiente) {
      await actualizarCuenta(
        supabase,
        cuentaId,
        { plan: 'past_due', past_due_limite: calcularLimitePastDue(), mp_preapproval_id: dataId },
        'suscripción pausada, pasa a past_due con plazo de gracia'
      );
    } else {
      console.log(LOG, `suscripción pausada, la cuenta ${cuentaId} está en '${cuenta.plan}', no cambio el plan`);
    }
    return;
  }

  if (estado === 'cancelled') {
    // No cortamos el acceso al toque: el Cliente sigue con acceso hasta
    // el final del período que ya pagó. Cubre cancelaciones desde
    // nuestro botón (cancelar-suscripcion ya guardó acceso_hasta, lo
    // respetamos) y desde la cuenta de MercadoPago del Cliente.
    if (cuenta.plan === 'active') {
      const accesoHasta =
        (cuenta.cancelacion_pendiente && cuenta.acceso_hasta) ||
        preapproval.next_payment_date ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await actualizarCuenta(
        supabase,
        cuentaId,
        { cancelacion_pendiente: true, acceso_hasta: accesoHasta, mp_preapproval_id: dataId },
        'suscripción cancelada, mantiene acceso hasta fin del período'
      );
    } else if (cuenta.plan === 'past_due') {
      // Con el pago trabado no hay un período pago por delante: el acceso
      // llega hasta donde ya llegaba el plazo de gracia.
      const accesoHasta = cuenta.past_due_limite || new Date().toISOString();
      await actualizarCuenta(
        supabase,
        cuentaId,
        { cancelacion_pendiente: true, acceso_hasta: accesoHasta },
        'suscripción cancelada con el pago trabado'
      );
    } else {
      // trial / inactive / suspended / cancelled: por ejemplo un checkout
      // que quedó abandonado. No hay nada pago que cancelar.
      console.log(LOG, `suscripción cancelada, la cuenta ${cuentaId} está en '${cuenta.plan}', no cambio nada`);
    }
    return;
  }

  // 'pending' u otro estado: no cambia el plan. Solo guardamos el id si
  // la cuenta no tenía ninguno.
  if (!guardado) {
    await actualizarCuenta(supabase, cuentaId, { mp_preapproval_id: dataId }, `guardo preapproval en estado '${estado}'`);
  }
}

// ---------------------------------------------------------------
// Cobros
// ---------------------------------------------------------------

async function procesarCobro(
  supabase: SupabaseClient,
  mpToken: string,
  preapprovalId: string,
  resultado: 'aprobado' | 'rechazado' | 'otro',
  descripcion: string
) {
  const { data: cuenta } = await supabase
    .from('cuentas')
    .select(COLUMNAS_CUENTA)
    .eq('mp_preapproval_id', preapprovalId)
    .limit(1)
    .maybeSingle<CuentaWebhook>();

  if (!cuenta) {
    const mensaje = `${descripcion}: el preapproval ${preapprovalId} no es el vigente de ninguna cuenta`;
    if (resultado === 'aprobado') {
      console.error(LOG, `ATENCIÓN: cobro aprobado sin cuenta asociada. ${mensaje}. Revisar en MercadoPago por si hay que devolverlo.`);
    } else {
      console.warn(LOG, mensaje);
    }
    return;
  }

  console.log(LOG, `${descripcion} (resultado: ${resultado}), cuenta ${cuenta.id} en plan '${cuenta.plan}'`);

  if (resultado === 'aprobado') {
    const canceladaPorUsuario = !!cuenta.cancelacion_pendiente || cuenta.plan === 'cancelled';
    if (canceladaPorUsuario) {
      const estadoPre = await leerEstadoPreapproval(preapprovalId, mpToken);
      if (estadoPre !== 'authorized') {
        console.log(
          LOG,
          `cobro aprobado pero la cuenta ${cuenta.id} canceló y el preapproval está '${estadoPre}': no la reactivo`
        );
        return;
      }
    }

    if (cuenta.plan === 'active' && !cuenta.cancelacion_pendiente && !cuenta.past_due_limite) {
      console.log(LOG, `renovación cobrada, la cuenta ${cuenta.id} ya estaba al día`);
      return;
    }

    await actualizarCuenta(
      supabase,
      cuenta.id,
      { plan: 'active', past_due_limite: null, cancelacion_pendiente: false, acceso_hasta: null },
      'cobro aprobado, pasa a active'
    );
    return;
  }

  if (resultado === 'rechazado') {
    if (cuenta.plan === 'active' && !cuenta.cancelacion_pendiente) {
      await actualizarCuenta(
        supabase,
        cuenta.id,
        { plan: 'past_due', past_due_limite: calcularLimitePastDue() },
        'cobro rechazado, pasa a past_due con plazo de gracia'
      );
    } else if (cuenta.plan === 'past_due' && !cuenta.past_due_limite) {
      // No le reiniciamos el plazo si ya lo tenía; solo lo ponemos si
      // faltaba.
      await actualizarCuenta(supabase, cuenta.id, { past_due_limite: calcularLimitePastDue() }, 'cobro rechazado, faltaba el plazo de gracia');
    } else {
      console.log(LOG, `cobro rechazado, la cuenta ${cuenta.id} está en '${cuenta.plan}', no cambio el plan`);
    }
    return;
  }

  console.log(LOG, `cobro sin resultado final todavía, no cambio nada en la cuenta ${cuenta.id}`);
}

async function procesarCobroSuscripcion(supabase: SupabaseClient, mpToken: string, dataId: string) {
  const cobro = await mpGet(`/authorized_payments/${dataId}`, mpToken);
  if (!cobro) return;

  const preapprovalId: string | undefined = cobro.preapproval_id;
  const estadoCobro: string | undefined = cobro.status;
  const estadoPago: string | undefined = cobro.payment?.status;
  const detalle: string | undefined = cobro.payment?.status_detail;

  if (!preapprovalId) {
    console.warn(LOG, `authorized_payment ${dataId} sin preapproval_id, lo ignoro`);
    return;
  }

  let resultado: 'aprobado' | 'rechazado' | 'otro' = 'otro';
  if (estadoPago === 'approved') resultado = 'aprobado';
  else if (estadoCobro === 'recycling' || estadoPago === 'rejected') resultado = 'rechazado';

  await procesarCobro(
    supabase,
    mpToken,
    preapprovalId,
    resultado,
    `authorized_payment ${dataId} (status ${estadoCobro}, pago ${estadoPago ?? 'sin pago'}${detalle ? `, ${detalle}` : ''}, ${cobro.transaction_amount ?? '?'} ${cobro.currency_id ?? ''})`
  );
}

async function procesarPagoComun(supabase: SupabaseClient, mpToken: string, dataId: string) {
  const pago = await mpGet(`/v1/payments/${dataId}`, mpToken);
  if (!pago) return;

  const preapprovalId: string | undefined =
    pago.metadata?.preapproval_id || pago.point_of_interaction?.transaction_data?.subscription_id;

  if (!preapprovalId) {
    console.log(LOG, `payment ${dataId} no es de una suscripción, lo ignoro`);
    return;
  }
  if (pago.status !== 'approved') {
    // Los rechazos se toman de subscription_authorized_payment, que
    // siempre devuelve el estado final del cobro.
    console.log(LOG, `payment ${dataId} (${pago.status}) de la suscripción ${preapprovalId}: lo maneja el aviso del cobro`);
    return;
  }

  await procesarCobro(supabase, mpToken, preapprovalId, 'aprobado', `payment ${dataId} aprobado`);
}

// ---------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // deno-lint-ignore no-explicit-any
    let cuerpo: any = null;
    try {
      cuerpo = await req.json();
    } catch {
      // Sin body JSON: alcanza con los parámetros de la URL.
    }

    const dataId =
      url.searchParams.get('data.id') ||
      (cuerpo?.data?.id != null ? String(cuerpo.data.id) : null) ||
      url.searchParams.get('id');
    const tipo = url.searchParams.get('type') || url.searchParams.get('topic') || cuerpo?.type || null;

    if (!dataId || !tipo) {
      return new Response('ok', { headers: corsHeaders });
    }

    const esPreapproval = TIPOS_PREAPPROVAL.has(tipo);
    const esCobro = tipo === TIPO_COBRO_SUSCRIPCION;
    const esPago = tipo === TIPO_PAGO;

    if (!esPreapproval && !esCobro && !esPago) {
      console.log(LOG, `evento '${tipo}' ignorado`);
      return new Response('ok', { headers: corsHeaders });
    }

    const firmaValida = await verificarFirma(req, dataId);
    if (!firmaValida) {
      console.warn(LOG, `firma inválida para ${tipo} ${dataId}`);
      return new Response(JSON.stringify({ error: 'Firma inválida' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(LOG, `recibido ${tipo} ${dataId}`);

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (esPreapproval) {
      await procesarPreapproval(supabase, mpToken, dataId);
    } else if (esCobro) {
      await procesarCobroSuscripcion(supabase, mpToken, dataId);
    } else {
      await procesarPagoComun(supabase, mpToken, dataId);
    }

    return new Response('ok', { headers: corsHeaders });
  } catch (err) {
    if (err instanceof ErrorReintentable) {
      console.error(LOG, `error temporal, MercadoPago va a reintentar: ${err.message}`);
    } else {
      console.error(LOG, err);
    }
    return new Response(JSON.stringify({ error: 'Error inesperado', detalle: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
