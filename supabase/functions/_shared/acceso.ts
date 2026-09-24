// Inductoria · Edge Functions: reglas de acceso compartidas
// ------------------------------------------------
// Espejo de src/lib/acceso.js para el lado del servidor. Las funciones
// que llaman a un modelo de IA (procesar-contenido, actualizar-curso-ia,
// preguntar-curso, extraer-texto-archivo) tienen que validar esto ACÁ,
// no solo confiar en que el frontend no muestre el botón: cualquiera
// podría llamar la Edge Function directo con curl durante un trial.
//
// Carpeta con guion bajo (_shared): Supabase no la despliega como una
// función propia, solo está disponible para que otras funciones la
// importen con un import relativo.

// CUENTAS EXENTAS (lado servidor): ÚNICO lugar donde se define esta
// lista para las Edge Functions; todas la leen importando este archivo.
// Del lado del navegador la lista equivalente está en src/lib/acceso.js:
// si agregás o sacás un mail, cambialo en los DOS lugares.
// Son cuentas del equipo / de prueba que tienen acceso completo sin
// suscripción (no son necesariamente administradores: los
// administradores del panel están en la tabla `administradores`).
export const CUENTAS_EXENTAS = new Set([
  'desarrollosdos@gmail.com',
  'lucasanzone@gmail.com',
  'sofiasanzone@gmail.com',
]);

export interface CuentaPlan {
  plan: string;
  trial_ends_at?: string | null;
}

// Acceso a las funciones de IA con costo real (Claude: generar/
// actualizar curso, chat de dudas, lectura de imágenes): activa, con
// pago pendiente (todavía no se suspendió), o cuenta exenta. NUNCA en
// trial, aunque el trial esté vigente.
//
// La transcripción de audio (Groq Whisper, en extraer-texto-archivo) NO
// usa esta función — Groq es gratis dentro de su límite diario, así que
// desde 2026-08-17 queda disponible también en trial. Ver el comentario
// correspondiente en extraer-texto-archivo/index.ts.
export function puedeUsarIA(cuenta: CuentaPlan | null | undefined, email?: string | null): boolean {
  if (email && CUENTAS_EXENTAS.has(email)) return true;
  if (!cuenta) return false;
  return cuenta.plan === 'active' || cuenta.plan === 'past_due';
}

export const MENSAJE_IA_BLOQUEADA_TRIAL =
  'Para generar o actualizar cursos con IA tenés que suscribirte. Durante la prueba gratis podés cargar empleados y contenido. También podés usar los cursos de la biblioteca.';

// Mismo bloqueo que MENSAJE_IA_BLOQUEADA_TRIAL, pero para
// generar-procedimiento — el mensaje genérico habla específicamente de
// "cursos", que sería confuso mostrarle a alguien que apretó "Generar
// procedimiento con IA".
export const MENSAJE_IA_BLOQUEADA_TRIAL_PROCEDIMIENTO =
  'Para generar procedimientos con IA tenés que suscribirte. Durante la prueba gratis podés cargar empleados y contenido.';

// Mensaje para el empleado (no ve ni maneja la suscripción, así que no
// tiene sentido pedirle a él que se suscriba).
export const MENSAJE_IA_BLOQUEADA_TRIAL_EMPLEADO =
  'El chat de dudas todavía no está disponible en esta cuenta. Si tenés alguna duda sobre el curso, consultala con tu encargado.';
