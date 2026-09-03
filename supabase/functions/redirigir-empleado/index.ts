// Inductoria · Edge Function: redirigir-empleado
// ------------------------------------------------
// Pública, sin autenticación (el empleado no tiene sesión). Recibe el
// código corto (los primeros 10 caracteres del token_acceso real) y
// busca qué empleado tiene un token que empieza así. Usa service role
// porque la tabla `empleados` no permite lectura anónima libre desde el
// cliente (mismo motivo por el que /checklist pasa por la Edge Function
// empleado-checklist en vez de consultar Supabase directo).

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
    const { codigo } = await req.json();
    if (!codigo || typeof codigo !== 'string') {
      return new Response(JSON.stringify({ error: 'Falta el código' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await supabaseAdmin
      .from('empleados')
      .select('token_acceso')
      .ilike('token_acceso', `${codigo}%`);

    // Si no hay exactamente una coincidencia (ninguna, o dos empleados
    // comparten el mismo prefijo, extremadamente improbable), se trata
    // como link inválido en vez de adivinar a cuál mandar.
    if (error || !data || data.length !== 1) {
      return new Response(JSON.stringify({ token_acceso: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ token_acceso: data[0].token_acceso }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
