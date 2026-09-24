// Inductoria · Edge Function: verificar-empleado
// ---------------------------------------------------
// Público, sin login. Valida que el token del link Y el PIN de 4 dígitos
// coincidan con el mismo empleado, antes de que el frontend muestre
// cualquier contenido (Mi Perfil, un curso, etc).
//
// 2026-09-24: la validación vive en _shared/empleado-auth.ts (la misma
// que usan ahora todas las funciones del empleado, con tope de intentos).
// El PIN llega en el header x-empleado-pin; se sigue aceptando en el body
// solo para no romperle la pantalla a quien tenga la versión anterior de
// la app cargada en el navegador.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  autenticarEmpleado,
  corsEmpleado,
  leerPin,
  respuestaError,
  respuestaErrorServidor,
  respuestaJson,
} from '../_shared/empleado-auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsEmpleado });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    const pin = leerPin(req) ?? (typeof body?.pin === 'string' ? body.pin.trim() : null);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const auth = await autenticarEmpleado(supabase, token, pin);
    if (auth.error) return respuestaError(auth.error);

    return respuestaJson({ ok: true, nombre: auth.empleado.nombre });
  } catch (err) {
    return respuestaErrorServidor(err);
  }
});
