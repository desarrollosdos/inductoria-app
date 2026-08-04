// Inductoria · Edge Function: precio-publico
// ------------------------------------------------
// Endpoint público (sin login) para que la landing estática
// (inductoria.com.ar, repo aparte) muestre siempre el precio vigente sin
// que haya que editar el HTML a mano cada vez que cambia desde Admin.
//
// Mismo patrón que precio-publico en Repunte. Se llama con la anon key
// como Bearer token, no requiere sesión. El precio no es dato sensible.

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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await supabase
      .from('configuracion_precio')
      .select('precio_base')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    return new Response(JSON.stringify({ precio_base: data?.precio_base || 12000 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Error inesperado' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
