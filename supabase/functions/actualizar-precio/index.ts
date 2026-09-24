// Inductoria · Edge Function: actualizar-precio
// -----------------------------------------------
// Solo administradores (tabla `administradores`, ver _shared/admin.ts)
// pueden cambiar el precio base (1 sucursal). El resto de las
// proporciones por volumen (2-4, 5-9, 10+) se calculan a partir de este
// único valor, ver src/lib/precio.js (y su copia en crear-suscripcion y
// agregar-sucursal-plan).
//
// Si la fila de configuracion_precio no existe o viene vacía, todos los
// lugares que leen el precio caen en el mismo valor por defecto: 12000
// (precio-publico, crear-suscripcion, agregar-sucursal-plan y
// PRECIO_BASE_POR_DEFECTO en src/lib/precio.js).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { obtenerAdministrador } from '../_shared/admin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const admin = await obtenerAdministrador(req.headers.get('Authorization'));
    if (!admin) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const precioBase = Number(body?.precio_base);

    if (!Number.isFinite(precioBase) || precioBase <= 0) {
      return new Response(JSON.stringify({ error: 'Ese precio no es válido. Ingresá un número mayor a cero.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await supabase
      .from('configuracion_precio')
      .update({
        precio_base: precioBase,
        actualizado_at: new Date().toISOString(),
        actualizado_por: admin.email,
      })
      .eq('id', 1)
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify(data), {
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
