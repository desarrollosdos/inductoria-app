// Inductoria · Edge Function: actualizar-precio
// -----------------------------------------------
// Solo administradores (tabla `administradores`, ver _shared/admin.ts).
// Desde 2026-09-25 el precio ya no cambia en el momento: se PROGRAMA un
// cambio con fecha de vigencia (tabla precio_cambios), igual que en
// Repunte. Hasta esa fecha los clientes ven el aviso en la app; ese día
// aplicar-cambio-precio pasa el precio a configuracion_precio y
// actualiza el monto de cada suscripción de MercadoPago.
//
// El precio que se carga es el de 1 sucursal. Los tramos por volumen
// (2-4, 5-9, 10+) se calculan con las mismas proporciones de
// src/lib/precio.js.
//
// GET  -> { precio_base, pendiente, historial }
// POST -> { precio_base, vigente_desde, sin_aviso? }  programa un cambio
// POST -> { cancelar_id }                             cancela uno pendiente
//
// Reglas:
//   - Un solo cambio pendiente por vez (cancelar primero).
//   - La fecha no puede ser anterior a hoy.
//   - Para SUBIR el precio hace falta avisar con al menos DIAS_AVISO
//     días, salvo que se marque sin_aviso (pensado para antes de tener
//     clientes reales). Bajarlo se puede aplicar en el día.
//   - Si la fecha es hoy, se aplica en el momento.
//
// Si la fila de configuracion_precio no existe o viene vacía, todos los
// lugares que leen el precio caen en el mismo valor por defecto: 12000.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { obtenerAdministrador } from '../_shared/admin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRECIO_BASE_POR_DEFECTO = 12000;
const DIAS_AVISO = 5;

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function hoyArgentina(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const admin = await obtenerAdministrador(req.headers.get('Authorization'));
    if (!admin) {
      return responder({ error: 'No autorizado' }, 403);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    async function estadoActual() {
      const { data: config } = await supabase
        .from('configuracion_precio')
        .select('precio_base')
        .eq('id', 1)
        .maybeSingle();

      const { data: pendiente } = await supabase
        .from('precio_cambios')
        .select('*')
        .is('aplicado_at', null)
        .is('cancelado_at', null)
        .order('vigente_desde', { ascending: true })
        .limit(1)
        .maybeSingle();

      const { data: historial } = await supabase
        .from('precio_cambios')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      return {
        precio_base: Number(config?.precio_base) || PRECIO_BASE_POR_DEFECTO,
        pendiente: pendiente || null,
        historial: historial || [],
        dias_aviso: DIAS_AVISO,
      };
    }

    if (req.method === 'GET') {
      return responder(await estadoActual());
    }

    if (req.method !== 'POST') {
      return responder({ error: 'Método no soportado' }, 405);
    }

    const body = await req.json().catch(() => ({}));

    // Cancelar un cambio pendiente ---------------------------------------
    if (body?.cancelar_id) {
      const { data: cancelado, error } = await supabase
        .from('precio_cambios')
        .update({ cancelado_at: new Date().toISOString() })
        .eq('id', body.cancelar_id)
        .is('aplicado_at', null)
        .is('cancelado_at', null)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!cancelado) {
        return responder({ error: 'Ese cambio ya se aplicó o ya estaba cancelado.' }, 400);
      }
      return responder(await estadoActual());
    }

    // Programar un cambio -------------------------------------------------
    const precioNuevo = Math.round(Number(body?.precio_base));
    if (!Number.isFinite(precioNuevo) || precioNuevo <= 0) {
      return responder({ error: 'Ese precio no es válido. Ingresá un número mayor a cero.' }, 400);
    }

    const hoy = hoyArgentina();
    const sinAviso = body?.sin_aviso === true;
    const vigenteDesde = sinAviso ? hoy : String(body?.vigente_desde || '').slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(vigenteDesde)) {
      return responder({ error: 'Elegí la fecha desde la que rige el precio nuevo.' }, 400);
    }
    if (vigenteDesde < hoy) {
      return responder({ error: 'La fecha no puede ser anterior a hoy.' }, 400);
    }

    const estado = await estadoActual();
    if (estado.pendiente) {
      return responder(
        { error: 'Ya hay un cambio de precio programado. Cancelalo primero si querés cargar otro.' },
        400
      );
    }
    if (precioNuevo === estado.precio_base) {
      return responder({ error: 'Ese ya es el precio actual.' }, 400);
    }

    const esAumento = precioNuevo > estado.precio_base;
    const minimoConAviso = sumarDias(hoy, DIAS_AVISO);
    if (esAumento && !sinAviso && vigenteDesde < minimoConAviso) {
      return responder(
        {
          error: `Para subir el precio a los que ya pagan hay que avisar con al menos ${DIAS_AVISO} días. Elegí una fecha desde el ${minimoConAviso.split('-').reverse().join('/')}.`,
        },
        400
      );
    }

    const { error: insertError } = await supabase.from('precio_cambios').insert({
      precio_base_nuevo: precioNuevo,
      precio_base_anterior: estado.precio_base,
      vigente_desde: vigenteDesde,
      aviso_dias_antes: DIAS_AVISO,
      aviso_enviado: vigenteDesde === hoy,
      creado_por: admin.email,
    });
    if (insertError) throw insertError;

    let aplicacion = null;
    if (vigenteDesde === hoy) {
      // Para hoy: se aplica ya, sin esperar al cron de la madrugada.
      const cronSecret = Deno.env.get('CRON_SECRET');
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/aplicar-cambio-precio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret ?? '' },
        body: '{}',
      });
      aplicacion = await res.json().catch(() => null);
      if (!res.ok) {
        return responder(
          { error: 'El cambio quedó cargado pero no se pudo aplicar ahora. Se va a aplicar esta noche.', aplicacion },
          500
        );
      }
    }

    return responder({ ...(await estadoActual()), aplicacion });
  } catch (err) {
    console.error(err);
    return responder({ error: 'Error inesperado', detalle: String(err) }, 500);
  }
});
