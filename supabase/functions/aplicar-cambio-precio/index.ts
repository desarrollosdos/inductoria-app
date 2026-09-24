// Inductoria · Edge Function: aplicar-cambio-precio
// ------------------------------------------------
// Mismo mecanismo que price-change-manager de Repunte. Corre una vez por
// día (cron 'inductoria-cambio-precio') y también la llama
// actualizar-precio cuando un cambio es para hoy. Hace tres cosas:
//
//   1. AVISO: si hay un cambio programado y ya estamos dentro de los
//      días de anticipación (aviso_dias_antes), manda un mail a cada
//      cliente que paga con su monto actual y el nuevo. Solo si están
//      cargados los secrets RESEND_API_KEY y AVISOS_EMAIL_FROM; si no,
//      el aviso queda solo en la app (el cartel se ve desde que se
//      programa el cambio). Se manda una sola vez.
//
//   2. VIGENCIA: el día que llega la fecha, pasa el precio nuevo a
//      configuracion_precio (desde ahí lo toman la landing, Suscripción
//      y las suscripciones nuevas).
//
//   3. SUSCRIPCIONES EXISTENTES: actualiza el monto en MercadoPago
//      (PUT /preapproval/{id}) de cada cuenta active o past_due, con su
//      cantidad de sucursales y el descuento por volumen que le toca.
//      Queda registrado por cuenta en precio_aplicado_log: si a una
//      cuenta le falla, se reintenta al día siguiente.
//
// Protegida con x-cron-secret (mismo CRON_SECRET que expirar-trials):
// sin eso cualquiera podría cambiar montos reales en MercadoPago.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Mismos tiers y proporciones que src/lib/precio.js, crear-suscripcion y
// agregar-sucursal-plan.
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

// Fecha de hoy en Argentina (UTC-3), formato AAAA-MM-DD.
function hoyArgentina(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function diasEntre(desdeISO: string, hastaISO: string): number {
  const a = Date.parse(desdeISO + 'T00:00:00Z');
  const b = Date.parse(hastaISO + 'T00:00:00Z');
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function fechaLarga(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function pesos(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Mail de aviso de cambio de precio. HTML simple con tablas y estilos en
// línea para que se vea bien en Gmail, Outlook y el celular. Colores de
// la landing de Inductoria (navy #1B2A3D, terracota #C1502E).
function armarMailAviso(
  nombreCuenta: string,
  sucursales: number,
  montoActual: number,
  montoNuevo: number,
  fechaVigencia: string
): { asunto: string; html: string; texto: string } {
  const nombre = nombreCuenta ? ` ${escaparHtml(nombreCuenta)}` : '';
  const detalleSucursales = sucursales === 1 ? '1 sucursal' : `${sucursales} sucursales`;
  const sube = montoNuevo > montoActual;
  const asunto = sube
    ? `Actualización del precio de Inductoria desde el ${fechaVigencia}`
    : `Baja el precio de Inductoria desde el ${fechaVigencia}`;

  const html = `<!DOCTYPE html>
<html lang="es-AR">
<body style="margin:0; padding:0; background:#FBF7EA;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EA; padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border-radius:14px; overflow:hidden; font-family:Arial, Helvetica, sans-serif; color:#2b2620;">
        <tr>
          <td style="background:#1B2A3D; padding:18px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle; padding-right:10px;">
                  <img src="https://inductoria.com.ar/favicon-64.png" width="32" height="32" alt="" style="display:block; border:0;">
                </td>
                <td style="vertical-align:middle;">
                  <span style="color:#ffffff; font-size:20px; font-weight:bold; letter-spacing:0.3px;">Inductoria</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <p style="margin:0 0 16px; font-size:16px;">Hola${nombre},</p>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.6;">
              Te escribimos para avisarte que desde el <strong>${fechaVigencia}</strong> cambia el precio de tu plan de Inductoria (${detalleSucursales}).
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5ddc9; border-radius:10px; margin:0 0 20px;">
              <tr>
                <td style="padding:14px 16px; font-size:14px; color:#6b6255;">Hoy pagás</td>
                <td align="right" style="padding:14px 16px; font-size:16px; color:#2b2620;">${pesos(montoActual)} por mes</td>
              </tr>
              <tr>
                <td style="padding:14px 16px; font-size:14px; color:#6b6255; border-top:1px solid #e5ddc9;">Desde el ${fechaVigencia}</td>
                <td align="right" style="padding:14px 16px; font-size:18px; font-weight:bold; color:#C1502E; border-top:1px solid #e5ddc9;">${pesos(montoNuevo)} por mes</td>
              </tr>
            </table>
            <p style="margin:0 0 14px; font-size:15px; line-height:1.6;">
              No tenés que hacer nada: el monto se actualiza solo en tu suscripción de Mercado Pago y se aplica a los cobros desde esa fecha.
            </p>
            <p style="margin:0 0 24px; font-size:15px; line-height:1.6;">
              Si no estás de acuerdo, podés dar de baja tu suscripción cuando quieras desde la sección Suscripción, sin ningún cargo.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td style="background:#C1502E; border-radius:999px;">
                  <a href="https://app.inductoria.com.ar/" style="display:inline-block; padding:12px 24px; color:#ffffff; font-size:14px; font-weight:bold; text-decoration:none;">Entrar a Inductoria</a>
                </td>
              </tr>
            </table>
            <p style="margin:0; font-size:14px; line-height:1.6; color:#6b6255;">
              Cualquier duda, respondé este mail y te contestamos.<br>Equipo de Inductoria
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px; background:#FBF7EA; font-size:12px; color:#6b6255; text-align:center;">
            Te llega este mail porque tenés una suscripción activa en Inductoria.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texto = [
    `Hola${nombreCuenta ? ` ${nombreCuenta}` : ''},`,
    '',
    `Desde el ${fechaVigencia} cambia el precio de tu plan de Inductoria (${detalleSucursales}).`,
    `Hoy pagás ${pesos(montoActual)} por mes. Desde el ${fechaVigencia}: ${pesos(montoNuevo)} por mes.`,
    '',
    'No tenés que hacer nada: el monto se actualiza solo en tu suscripción de Mercado Pago.',
    'Si no estás de acuerdo, podés dar de baja tu suscripción cuando quieras desde la sección Suscripción, sin ningún cargo.',
    '',
    'Cualquier duda, respondé este mail.',
    'Equipo de Inductoria',
  ].join('\n');

  return { asunto, html, texto };
}

async function mandarMailAviso(
  resendKey: string,
  from: string,
  para: string,
  nombreCuenta: string,
  sucursales: number,
  montoActual: number,
  montoNuevo: number,
  fechaVigencia: string
) {
  const { asunto, html, texto } = armarMailAviso(nombreCuenta, sucursales, montoActual, montoNuevo, fechaVigencia);
  // Las respuestas van a la casilla de contacto, no a la dirección de envío.
  const replyTo = Deno.env.get('AVISOS_REPLY_TO') || 'info.inductoria@gmail.com';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [para], reply_to: replyTo, subject: asunto, html, text: texto }),
  });
  if (!res.ok) throw new Error(await res.text());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const secretEsperado = Deno.env.get('CRON_SECRET');
  if (!secretEsperado || req.headers.get('x-cron-secret') !== secretEsperado) {
    return responder({ error: 'No autorizado' }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const mailFrom = Deno.env.get('AVISOS_EMAIL_FROM');
    const hoy = hoyArgentina();

    const resumen = {
      mailsEnviados: 0,
      mailsError: 0,
      mailsSinConfigurar: false,
      preciosVigentes: 0,
      suscripcionesOk: 0,
      suscripcionesError: 0,
    };

    // Cuentas que pagan hoy, con su cantidad de sucursales (misma cuenta
    // que hace crear-suscripcion: la mayor entre sucursales cargadas y
    // contratadas).
    async function cuentasQuePagan() {
      const { data: cuentas, error } = await supabase
        .from('cuentas')
        .select('id, owner_id, nombre, plan, mp_preapproval_id, sucursales_contratadas, cancelacion_pendiente')
        .in('plan', ['active', 'past_due'])
        .not('mp_preapproval_id', 'is', null);
      if (error) throw error;

      const lista = [];
      for (const c of cuentas || []) {
        if (c.cancelacion_pendiente) continue;
        const { count } = await supabase
          .from('negocios')
          .select('*', { count: 'exact', head: true })
          .eq('cuenta_id', c.id);
        lista.push({ ...c, sucursales: Math.max(count || 1, c.sucursales_contratadas || 1) });
      }
      return lista;
    }

    const { data: pendientes, error: pendError } = await supabase
      .from('precio_cambios')
      .select('*')
      .is('aplicado_at', null)
      .is('cancelado_at', null)
      .order('vigente_desde', { ascending: true });
    if (pendError) throw pendError;

    // 1. AVISO -----------------------------------------------------------
    for (const cambio of pendientes || []) {
      if (cambio.aviso_enviado) continue;
      if (diasEntre(hoy, cambio.vigente_desde) > cambio.aviso_dias_antes) continue;
      if (cambio.vigente_desde <= hoy) {
        // Cambio para hoy: no tiene sentido avisar "a partir de hoy".
        await supabase.from('precio_cambios').update({ aviso_enviado: true }).eq('id', cambio.id);
        continue;
      }

      if (!resendKey || !mailFrom) {
        resumen.mailsSinConfigurar = true;
      } else {
        const precioAnterior = Number(cambio.precio_base_anterior) || Number(cambio.precio_base_nuevo);
        for (const c of await cuentasQuePagan()) {
          try {
            const { data: owner } = await supabase.auth.admin.getUserById(c.owner_id);
            const email = owner?.user?.email;
            if (!email) continue;
            await mandarMailAviso(
              resendKey,
              mailFrom,
              email,
              c.nombre || '',
              c.sucursales,
              precioTotalMensual(c.sucursales, precioAnterior),
              precioTotalMensual(c.sucursales, Number(cambio.precio_base_nuevo)),
              fechaLarga(cambio.vigente_desde)
            );
            resumen.mailsEnviados++;
          } catch (err) {
            console.error(`No se pudo avisar el cambio de precio a la cuenta ${c.id}:`, err);
            resumen.mailsError++;
          }
        }
      }

      await supabase.from('precio_cambios').update({ aviso_enviado: true }).eq('id', cambio.id);
    }

    // 2. VIGENCIA --------------------------------------------------------
    const vencidos = (pendientes || []).filter((c) => c.vigente_desde <= hoy);
    if (vencidos.length > 0) {
      const ultimo = vencidos[vencidos.length - 1];
      const { error: cfgError } = await supabase
        .from('configuracion_precio')
        .update({
          precio_base: ultimo.precio_base_nuevo,
          actualizado_at: new Date().toISOString(),
          actualizado_por: ultimo.creado_por || 'cambio programado',
        })
        .eq('id', 1);
      if (cfgError) throw cfgError;

      const ahora = new Date().toISOString();
      for (const c of vencidos) {
        await supabase.from('precio_cambios').update({ aplicado_at: ahora }).eq('id', c.id);
      }
      resumen.preciosVigentes = vencidos.length;
    }

    // 3. SUSCRIPCIONES EXISTENTES ----------------------------------------
    // Siempre contra el último cambio aplicado, así los que fallaron un
    // día se reintentan al siguiente.
    const { data: vigente } = await supabase
      .from('precio_cambios')
      .select('*')
      .not('aplicado_at', 'is', null)
      .is('cancelado_at', null)
      .order('vigente_desde', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (vigente) {
      const { data: yaHechos } = await supabase
        .from('precio_aplicado_log')
        .select('cuenta_id')
        .eq('precio_cambio_id', vigente.id)
        .eq('ok', true);
      const hechos = new Set((yaHechos || []).map((f) => f.cuenta_id));

      for (const c of await cuentasQuePagan()) {
        if (hechos.has(c.id)) continue;
        const monto = precioTotalMensual(c.sucursales, Number(vigente.precio_base_nuevo));

        let ok = false;
        let errorTexto: string | null = null;
        try {
          const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${c.mp_preapproval_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mpToken}` },
            body: JSON.stringify({ auto_recurring: { transaction_amount: monto, currency_id: 'ARS' } }),
          });
          ok = mpRes.ok;
          if (!ok) errorTexto = await mpRes.text();
        } catch (err) {
          errorTexto = String(err);
        }

        await supabase.from('precio_aplicado_log').upsert(
          {
            cuenta_id: c.id,
            precio_cambio_id: vigente.id,
            ok,
            monto,
            error: errorTexto,
            intentado_at: new Date().toISOString(),
          },
          { onConflict: 'cuenta_id,precio_cambio_id' }
        );

        if (ok) resumen.suscripcionesOk++;
        else {
          console.error(`No se pudo actualizar el monto de la cuenta ${c.id}:`, errorTexto);
          resumen.suscripcionesError++;
        }
      }
    }

    return responder(resumen);
  } catch (err) {
    console.error(err);
    return responder({ error: 'Error inesperado', detalle: String(err) }, 500);
  }
});
