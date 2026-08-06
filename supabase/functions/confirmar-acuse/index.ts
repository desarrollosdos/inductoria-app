// Inductoria · Edge Function: confirmar-acuse
// -----------------------------------------------
// Público, sin login. El empleado confirma explícitamente (checkbox +
// botón) haber leído y entendido el contenido de un curso ya aprobado.
// Guarda la fecha/hora exacta — es el "acuse de recibido" real, con
// peso legal: una acción afirmativa del empleado, con timestamp.
//
// Solo se puede confirmar sobre un curso que el empleado YA completó
// (progreso_empleado.completado = true); no se puede adelantar.

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
    const { token, microcurso_id } = await req.json();

    if (!token || !microcurso_id) {
      return new Response(JSON.stringify({ error: 'Faltan datos.' }), {
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
      .select('id')
      .eq('token_acceso', token)
      .is('fecha_baja', null)
      .maybeSingle();

    if (empleadoError || !empleado) {
      return new Response(JSON.stringify({ error: 'Link inválido o vencido.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ahora = new Date().toISOString();

    const { data: actualizado, error: updateError } = await supabase
      .from('progreso_empleado')
      .update({ acuse_confirmado_at: ahora })
      .eq('empleado_id', empleado.id)
      .eq('microcurso_id', microcurso_id)
      .eq('completado', true)
      .select('acuse_confirmado_at')
      .maybeSingle();

    if (updateError) throw updateError;

    if (!actualizado) {
      return new Response(
        JSON.stringify({ error: 'Todavía no completaste este curso, no se puede confirmar el acuse.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ ok: true, fecha: actualizado.acuse_confirmado_at }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Error inesperado.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
