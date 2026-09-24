// Inductoria · Edge Function: redirigir-empleado
// ------------------------------------------------
// Pública, sin autenticación (el empleado no tiene sesión). Recibe el
// código corto (los primeros 10 caracteres del token_acceso real) y
// busca qué empleado tiene un token que empieza así. Usa service role
// porque la tabla `empleados` no permite lectura anónima libre desde el
// cliente (mismo motivo por el que /checklist pasa por la Edge Function
// empleado-checklist en vez de consultar Supabase directo).
//
// 2026-09-24: antes se buscaba con ilike(`${codigo}%`) sin validar nada,
// así que mandando "%" o un prefijo de 1 o 2 letras se podían ir
// descubriendo tokens de otros empleados. Ahora el código tiene que
// tener exactamente 10 caracteres del alfabeto de los tokens, se busca
// distinguiendo mayúsculas (LIKE, no ILIKE) con los comodines escapados,
// y además se confirma en el código que el token empiece exactamente así.
// Aunque el link se resuelva, después igual hace falta el PIN.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Los tokens se generan en la base (no hay código que los arme en el
// repo): se aceptan letras, números, guion y guion bajo, que cubre hex,
// base64url y UUID.
const FORMATO_CODIGO = /^[A-Za-z0-9_-]{10}$/;

const MENSAJE_LINK_INVALIDO = 'Este link no funciona. Pedile uno nuevo a tu encargado.';
const MENSAJE_ERROR = 'No pudimos abrir tu link. Probá de nuevo en un rato.';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const codigo = typeof body?.codigo === 'string' ? body.codigo.trim() : '';

    if (!FORMATO_CODIGO.test(codigo)) {
      return json({ token_acceso: null, error: MENSAJE_LINK_INVALIDO });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // "_" es comodín en LIKE: se escapa para que cuente como letra común.
    // El único comodín que queda es el "%" final, que ponemos nosotros.
    const patron = codigo.replace(/[\\%_]/g, (c: string) => `\\${c}`) + '%';

    const { data, error } = await supabaseAdmin
      .from('empleados')
      .select('token_acceso')
      .like('token_acceso', patron)
      .is('fecha_baja', null)
      .limit(2);

    if (error) {
      console.error('redirigir-empleado:', error);
      return json({ token_acceso: null, error: MENSAJE_ERROR }, 500);
    }

    const coincidencias = (data || []).filter(
      (e: { token_acceso: string | null }) =>
        typeof e.token_acceso === 'string' && e.token_acceso.startsWith(codigo)
    );

    // Si no hay exactamente una coincidencia (ninguna, o dos empleados
    // comparten el mismo prefijo, extremadamente improbable), se trata
    // como link inválido en vez de adivinar a cuál mandar.
    if (coincidencias.length !== 1) {
      return json({ token_acceso: null, error: MENSAJE_LINK_INVALIDO });
    }

    return json({ token_acceso: coincidencias[0].token_acceso });
  } catch (e) {
    console.error('redirigir-empleado:', e);
    return json({ token_acceso: null, error: MENSAJE_ERROR }, 500);
  }
});
