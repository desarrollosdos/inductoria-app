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

// PostgREST devuelve como máximo 1000 filas por consulta. Antes se hacía
// una sola consulta y, pasadas las 1000 preguntas, el conteo quedaba
// cortado sin aviso. Traemos de a páginas hasta que no venga más nada.
const TAMANO_PAGINA = 1000;
// Los ids van en la URL (filtro "in"), así que los mandamos de a tandas
// para no armar una URL gigante con cuentas de muchos cursos.
const IDS_POR_TANDA = 100;

// deno-lint-ignore no-explicit-any
async function traerTodo<T>(armarConsulta: (desde: number, hasta: number) => any): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await armarConsulta(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw error;
    const pagina = (data || []) as T[];
    filas.push(...pagina);
    if (pagina.length < TAMANO_PAGINA) break;
  }
  return filas;
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

    const microcursos = await traerTodo<{ id: string; titulo: string }>((desde, hasta) =>
      supabase
        .from('microcursos')
        .select('id, titulo')
        .eq('cuenta_id', cuenta.id)
        .eq('estado', 'aprobado')
        .order('id', { ascending: true })
        .range(desde, hasta)
    );

    const idsPropios = (microcursos || []).map((m) => m.id);
    if (idsPropios.length === 0) {
      return new Response(JSON.stringify({ gaps: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const preguntasIA: { microcurso_id: string; pregunta: string }[] = [];
    for (let i = 0; i < idsPropios.length; i += IDS_POR_TANDA) {
      const tanda = idsPropios.slice(i, i + IDS_POR_TANDA);
      const filas = await traerTodo<{ microcurso_id: string; pregunta: string }>((desde, hasta) =>
        supabase
          .from('preguntas_ia')
          .select('microcurso_id, pregunta')
          .in('microcurso_id', tanda)
          // Orden estable (id desempata) para que las páginas no se pisen
          // ni salteen filas; las más recientes primero, así los ejemplos
          // que ve el dueño son las preguntas más nuevas.
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(desde, hasta)
      );
      preguntasIA.push(...filas);
    }

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
    return new Response(JSON.stringify({ error: 'No pudimos cargar las preguntas de tus empleados.', detalle: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
