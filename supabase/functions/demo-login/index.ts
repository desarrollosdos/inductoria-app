// Inductoria · Edge Function: demo-login
// ------------------------------------------------
// 2026-09-27. Abre la cuenta de demostración sin mail ni contraseña.
// La llama Login.jsx cuando alguien escribe demo@inductoria.com.ar.
//
// Cómo funciona: con el cliente de servicio genera un link mágico para la
// cuenta demo (Google/Supabase NO manda ningún mail con generateLink) y le
// devuelve al navegador solo el código de un solo uso (hashed_token). El
// navegador lo canjea con supabase.auth.verifyOtp y queda logueado.
//
// Seguridad: solo sirve para ESA cuenta (el mail está fijo acá, no viene
// del navegador) y la cuenta es de solo lectura en la base
// (cuentas_demo.solo_lectura, ver supabase/sql/2026-09-27-cuenta-demo.sql).
// Además, la cuenta demo está en prueba gratis, así que las funciones de
// IA con costo quedan bloqueadas.
//
// Deploy SIN verificación de JWT (el visitante todavía no tiene sesión):
//   npx supabase functions deploy demo-login --no-verify-jwt
//
// Para dar de baja la demo: borrar esta función en Supabase y la fila de
// cuentas_demo.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const DEMO_EMAIL = 'demo@inductoria.com.ar';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // La demo solo funciona si está habilitada en la tabla cuentas_demo.
    const { data: fila, error: filaError } = await supabase
      .from('cuentas_demo')
      .select('email')
      .eq('email', DEMO_EMAIL)
      .maybeSingle();
    if (filaError || !fila) {
      return json({ error: 'La cuenta de demostración no está disponible.' }, 404);
    }

    // Si el usuario todavía no existe, lo creamos ya confirmado. Si ya
    // existe, createUser devuelve error y lo ignoramos.
    await supabase.auth.admin.createUser({ email: DEMO_EMAIL, email_confirm: true });

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: DEMO_EMAIL,
    });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      console.error('demo-login generateLink:', error);
      return json({ error: 'No pudimos abrir la demo.' }, 500);
    }

    return json({ token_hash: tokenHash });
  } catch (err) {
    console.error('demo-login:', err);
    return json({ error: 'Error inesperado' }, 500);
  }
});
