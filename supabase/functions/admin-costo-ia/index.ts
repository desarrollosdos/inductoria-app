// Inductoria · Edge Function: admin-costo-ia
// ---------------------------------------------
// Devuelve el costo real de IA (tokens reales, no estimado) acumulado,
// total y del mes en curso, y desglosado por cuenta. Solo administradores
// (tabla `administradores`, ver _shared/admin.ts).
//
// También devuelve estadísticas de transcripción de audio (Groq): no es
// costo real en USD (Groq es gratis dentro de su límite diario), pero
// desde que se habilitó en trial (2026-08-17) sirve tener visibilidad
// del volumen acá, por si algún día conviene revisar si sigue siendo
// gratis a esa escala.
//
// "Hoy" y "este mes" se calculan en hora de Argentina, y las lecturas
// van paginadas para no cortar en 1000 filas sin avisar.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  esAdministrador,
  traerTodasLasFilas,
  inicioDelDiaArgentina,
  inicioDelMesArgentina,
} from '../_shared/admin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegistroCosto {
  cuenta_id: string | null;
  costo_usd: number | string | null;
  created_at: string;
  // Según cómo infiera el tipo Supabase, la relación viene como objeto o
  // como array de un elemento; contemplamos las dos.
  cuentas: { nombre: string | null } | { nombre: string | null }[] | null;
}

interface RegistroAudio {
  plan_al_momento: string | null;
  duracion_segundos: number | string | null;
  created_at: string;
}

interface CostoPorCuenta {
  nombre: string;
  usd: number;
  generaciones: number;
}

function nombreDeCuenta(r: RegistroCosto): string {
  const rel = Array.isArray(r.cuentas) ? r.cuentas[0] : r.cuentas;
  return rel?.nombre || 'Cuenta eliminada';
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

    const registros = await traerTodasLasFilas<RegistroCosto>((desde, hasta) =>
      supabase
        .from('ai_usage_log')
        .select('cuenta_id, costo_usd, created_at, cuentas(nombre)')
        .order('created_at', { ascending: true })
        .range(desde, hasta)
    );

    const inicioMes = inicioDelMesArgentina();
    const inicioHoy = inicioDelDiaArgentina();

    let totalUsd = 0;
    let totalUsdMes = 0;
    let generaciones = 0;
    const porCuentaMapa: Record<string, CostoPorCuenta> = {};

    registros.forEach((r) => {
      const costo = Number(r.costo_usd) || 0;
      totalUsd += costo;
      generaciones += 1;
      if (new Date(r.created_at) >= inicioMes) {
        totalUsdMes += costo;
      }
      const clave = r.cuenta_id || 'sin_cuenta';
      if (!porCuentaMapa[clave]) {
        porCuentaMapa[clave] = { nombre: nombreDeCuenta(r), usd: 0, generaciones: 0 };
      }
      porCuentaMapa[clave].usd += costo;
      porCuentaMapa[clave].generaciones += 1;
    });

    const porCuenta = Object.values(porCuentaMapa).sort((a, b) => b.usd - a.usd);

    // Estadísticas de transcripción de audio (Groq), separado del costo
    // real de arriba porque no tiene costo en USD. También suma la
    // duración real de cada audio (duracion_segundos), para poder
    // comparar el uso diario contra el límite gratis real de Groq.
    const audios = await traerTodasLasFilas<RegistroAudio>((desde, hasta) =>
      supabase
        .from('audio_transcripciones_log')
        .select('plan_al_momento, duracion_segundos, created_at')
        .order('created_at', { ascending: true })
        .range(desde, hasta)
    );

    let audioTotal = 0;
    let audioHoy = 0;
    let audioMes = 0;
    let audioTrial = 0;
    let segundosTotal = 0;
    let segundosHoy = 0;
    let segundosMes = 0;
    let segundosTrial = 0;

    audios.forEach((a) => {
      const duracion = Number(a.duracion_segundos) || 0;
      const enTrial = a.plan_al_momento === 'trial';
      const fecha = new Date(a.created_at);
      const esHoy = fecha >= inicioHoy;
      const esMes = fecha >= inicioMes;

      audioTotal += 1;
      segundosTotal += duracion;
      if (esMes) {
        audioMes += 1;
        segundosMes += duracion;
      }
      if (esHoy) {
        audioHoy += 1;
        segundosHoy += duracion;
      }
      if (enTrial) {
        audioTrial += 1;
        segundosTrial += duracion;
      }
    });

    // Límite gratis real de Groq para whisper-large-v3-turbo: 8hs (28.800
    // segundos) de audio por día. Mandamos el % ya calculado para no
    // duplicar el número mágico en el frontend. OJO: "hoy" es el día de
    // Argentina; Groq puede contar su día en otro huso, así que el % es
    // una referencia, no el número exacto de Groq.
    const LIMITE_SEGUNDOS_GROQ_DIA = 28800;
    const porcentajeLimiteHoy = Math.min(
      999,
      Math.round((segundosHoy / LIMITE_SEGUNDOS_GROQ_DIA) * 1000) / 10
    );

    return new Response(
      JSON.stringify({
        totalUsd,
        totalUsdMes,
        generaciones,
        porCuenta,
        audio: {
          total: audioTotal,
          hoy: audioHoy,
          mes: audioMes,
          enTrial: audioTrial,
          segundosTotal,
          segundosHoy,
          segundosMes,
          segundosTrial,
          porcentajeLimiteHoy,
        },
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
