// Inductoria · Edge Function: mercadopago-webhook
// ------------------------------------------------
// Recibe las notificaciones de MercadoPago cuando cambia el estado de
// una suscripción (preapproval), y actualiza cuentas.plan acorde.
// Verifica la firma x-signature, mismo mecanismo que en Repunte.
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

// Mapeo del estado de MercadoPago al plan de la cuenta.
function mapearEstado(mpStatus: string): string {
  if (mpStatus === 'authorized') return 'active';
  if (mpStatus === 'paused') return 'past_due';
  if (mpStatus === 'cancelled') return 'cancelled';
  return 'inactive';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const dataId = url.searchParams.get('data.id') || url.searchParams.get('id');
    const tipo = url.searchParams.get('type') || url.searchParams.get('topic');

    if (!dataId || tipo !== 'preapproval') {
      // Otras notificaciones (pagos sueltos, etc.) las ignoramos por ahora.
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
    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });

    if (!mpRes.ok) {
      console.error('No se pudo consultar el preapproval en MercadoPago');
      return new Response('ok', { headers: corsHeaders });
    }

    const preapproval = await mpRes.json();
    const cuentaId = preapproval.external_reference;
    const nuevoPlan = mapearEstado(preapproval.status);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await supabase
      .from('cuentas')
      .update({ plan: nuevoPlan, mp_preapproval_id: dataId })
      .eq('id', cuentaId);

    return new Response('ok', { headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Error inesperado', detalle: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
