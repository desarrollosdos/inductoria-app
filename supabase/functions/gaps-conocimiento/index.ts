// Inductoria · Edge Function: gaps-conocimiento
// ------------------------------------------------
// A diferencia de admin-metrics (que es solo para el email admin), esta
// función la puede llamar cualquier dueño logueado: le devuelve, sobre
// SUS PROPIOS cursos, cuáles generan más preguntas en el chat de dudas
// (preguntas_ia), con algunos ejemplos. Es la señal de "este curso
// probablemente no quedó claro, revisalo".

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: cuenta } = await supabase
      .from('cuentas')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!cuenta) {
      return new Response(JSON.stringify({ gaps: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: microcursos } = await supabase
      .from('microcursos')
      .select('id, titulo')
      .eq('cuenta_id', cuenta.id)
      .eq('estado', 'aprobado');

    const idsPropios = (microcursos || []).map((m) => m.id);
    if (idsPropios.length === 0) {
      return new Response(JSON.stringify({ gaps: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: preguntasIA } = await supabase
      .from('preguntas_ia')
      .select('microcurso_id, pregunta')
      .in('microcurso_id', idsPropios);

    const tituloPorCurso: Record<string, string> = {};
    (microcursos || []).forEach((m) => (tituloPorCurso[m.id] = m.titulo));

    const infoPorCurso: Record<string, { total: number; ejemplos: string[] }> = {};
    (preguntasIA || []).forEach((p) => {
      if (!infoPorCurso[p.microcurso_id]) infoPorCurso[p.microcurso_id] = { total: 0, ejemplos: [] };
      infoPorCurso[p.microcurso_id].total++;
      if (infoPorCurso[p.microcurso_id].ejemplos.length < 3) {
        infoPorCurso[p.microcurso_id].ejemplos.push(p.pregunta);
      }
    });

    const gaps = Object.entries(infoPorCurso)
      .map(([microcurso_id, info]) => ({
        microcurso_id,
        titulo: tituloPorCurso[microcurso_id] || 'Curso',
        total: info.total,
        ejemplos: info.ejemplos,
      }))
      .sort((a, b) => b.total - a.total);

    return new Response(JSON.stringify({ gaps }), {
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
