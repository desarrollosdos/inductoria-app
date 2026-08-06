// Inductoria · Edge Function: verificar-empleado
// ---------------------------------------------------
// Público, sin login. Valida que el token del link Y el PIN de 4 dígitos
// coincidan con el mismo empleado, antes de que el frontend muestre
// cualquier contenido (Mi Perfil, un curso, etc).

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
    const { token, pin } = await req.json();

    if (!token || !pin) {
      return new Response(JSON.stringify({ error: 'Faltan datos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: empleado, error } = await supabase
      .from('empleados')
      .select('id, nombre')
      .eq('token_acceso', token)
      .eq('pin', pin)
      .is('fecha_baja', null)
      .maybeSingle();

    if (error) throw error;

    if (!empleado) {
      return new Response(JSON.stringify({ error: 'PIN incorrecto.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, nombre: empleado.nombre }), {
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
