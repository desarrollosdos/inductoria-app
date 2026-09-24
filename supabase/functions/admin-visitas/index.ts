// Inductoria · Edge Function: admin-visitas
// ---------------------------------------------
// Totales de visitas (landing y app) para el panel de Admin. Solo
// administradores (tabla `administradores`, ver _shared/admin.ts).
//
// "Hoy", "este mes" y el desglose por día usan la fecha de Argentina, no
// la de UTC: si no, las visitas de 21 a 24 hs caían en el día siguiente.
// Antes esto traía como mucho 20000 filas (y Supabase igual cortaba en
// 1000 sin avisar); ahora pagina hasta traer todo.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  esAdministrador,
  traerTodasLasFilas,
  fechaArgentina,
  inicioDelDiaArgentina,
  inicioDelMesArgentina,
} from '../_shared/admin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Visita {
  created_at: string;
  origen: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!(await esAdministrador(req.headers.get('Authorization')))) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const visitas = await traerTodasLasFilas<Visita>((desde, hasta) =>
      supabase
        .from('landing_visitas')
        .select('created_at, origen')
        .order('created_at', { ascending: false })
        .range(desde, hasta)
    );

    const hoy = inicioDelDiaArgentina();
    const inicioMes = inicioDelMesArgentina();

    const contadores = {
      landing: { total: 0, hoy: 0, mes: 0 },
      app: { total: 0, hoy: 0, mes: 0 },
    };

    const porDiaMapa: Record<string, { landing: number; app: number }> = {};

    visitas.forEach((v) => {
      const origen = v.origen === 'app' ? 'app' : 'landing';
      const fecha = new Date(v.created_at);

      contadores[origen].total++;
      if (fecha >= hoy) contadores[origen].hoy++;
      if (fecha >= inicioMes) contadores[origen].mes++;

      const clave = fechaArgentina(fecha);
      if (!porDiaMapa[clave]) porDiaMapa[clave] = { landing: 0, app: 0 };
      porDiaMapa[clave][origen]++;
    });

    const porDia = Object.entries(porDiaMapa)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 14)
      .map(([fecha, cantidades]) => ({
        fecha,
        landing: cantidades.landing,
        app: cantidades.app,
        total: cantidades.landing + cantidades.app,
      }));

    return new Response(
      JSON.stringify({
        landing: contadores.landing,
        app: contadores.app,
        total: {
          total: contadores.landing.total + contadores.app.total,
          hoy: contadores.landing.hoy + contadores.app.hoy,
          mes: contadores.landing.mes + contadores.app.mes,
        },
        porDia,
      }),
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
