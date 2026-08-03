// Inductoria · Edge Function: empleado-curso
// ------------------------------------------------
// Trae el contenido completo (pasos + preguntas) de UN curso puntual,
// validando el token del empleado. Se llama al hacer clic en un curso
// pendiente desde "Mi perfil".

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
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const microcursoId = url.searchParams.get('microcurso_id');

    if (!token || !microcursoId) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: empleado, error: empleadoError } = await supabase
      .from('empleados')
      .select('id, negocio_id, fecha_baja')
      .eq('token_acceso', token)
      .maybeSingle();

    if (empleadoError) throw empleadoError;
    if (!empleado || empleado.fecha_baja) {
      return new Response(JSON.stringify({ error: 'Link no válido' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: negocio } = await supabase
      .from('negocios')
      .select('cuenta_id')
      .eq('id', empleado.negocio_id)
      .single();

    const { data: microcurso, error: microcursoError } = await supabase
      .from('microcursos')
      .select('id, titulo, duracion_min, preguntas, cuenta_id')
      .eq('id', microcursoId)
      .single();

    if (microcursoError || !microcurso || microcurso.cuenta_id !== negocio?.cuenta_id) {
      return new Response(JSON.stringify({ error: 'Curso no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: pasos } = await supabase
      .from('pasos')
      .select('id, orden, titulo, contenido')
      .eq('microcurso_id', microcursoId)
      .order('orden', { ascending: true });

    // Nunca mandamos cuál es la respuesta correcta al frontend del
    // empleado, solo la pregunta y las opciones. Eso se valida en
    // empleado-completar-curso, del lado del servidor.
    const preguntasSinRespuesta = (microcurso.preguntas || []).map((p: any) => ({
      pregunta: p.pregunta,
      opciones: p.opciones,
    }));

    return new Response(
      JSON.stringify({
        titulo: microcurso.titulo,
        duracion_min: microcurso.duracion_min,
        pasos: pasos || [],
        preguntas: preguntasSinRespuesta,
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
