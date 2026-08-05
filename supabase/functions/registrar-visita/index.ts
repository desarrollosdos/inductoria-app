// Inductoria · Edge Function: registrar-visita
// -----------------------------------------------
// Público, sin login (lo llama tanto la landing como la app).
// Guarda un renglón por visita: path, origen ('landing' o 'app') y fecha/hora.
// No guarda IP ni ningún otro dato personal.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ORIGENES_VALIDOS = ['landing', 'app'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let path = '/';
    let origen = 'landing';
    try {
      const body = await req.json();
      if (body?.path) path = String(body.path).slice(0, 200);
      if (body?.origen && ORIGENES_VALIDOS.includes(body.origen)) {
        origen = body.origen;
      }
    } catch {
      // sin body, se guarda con los valores por defecto
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await supabase.from('landing_visitas').insert({ path, origen });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    // Aunque falle, respondemos 200: que ni la landing ni la app se rompan por esto.
    return new Response(JSON.stringify({ ok: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
