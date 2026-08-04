// Inductoria · Edge Function: registrar-visita
// -----------------------------------------------
// Público, sin login (lo llama cualquiera que entra a la landing).
// Guarda un renglón por visita, nada más. No guarda IP ni ningún dato
// personal, solo la ruta y la fecha/hora.

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
    let path = '/';
    try {
      const body = await req.json();
      if (body?.path) path = String(body.path).slice(0, 200);
    } catch {
      // sin body, se guarda con path por defecto
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await supabase.from('landing_visitas').insert({ path });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    // Aunque falle, respondemos 200: que la landing nunca se rompa por esto.
    return new Response(JSON.stringify({ ok: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
