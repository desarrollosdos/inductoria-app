// Inductoria · Reglas de acceso (plan / trial)
// ------------------------------------------------
// Lógica centralizada en un solo lugar en vez de duplicada en cada
// página (Dashboard, Empleados, Contenido tenían cada una su propia
// copia de CUENTAS_EXENTAS + "plan === 'active' || plan === 'past_due'").
//
// Estados posibles de cuentas.plan: 'trial' | 'active' | 'past_due' |
// 'suspended' | 'cancelled' | 'inactive' (legado: cuentas viejas
// creadas antes del trial, nunca llegaron a suscribirse).
//
// Modelo de trial (definido 2026-08-16): 7 días de acceso completo a
// la app (mismo criterio que Trainual: sin tope de empleados ni
// sucursales), EXCEPTO las funciones que usan IA (generar/actualizar
// cursos con IA, chat de dudas del empleado, lectura de imágenes/audio
// al cargar contenido), que requieren suscripción real. Esto es lo que
// mantiene acotado el riesgo de costo de IA en signups que no
// convierten, sin tener que resignar el trial por completo.

export const TRIAL_DIAS = 7;

// Cuentas que siempre tienen acceso completo, sin importar el estado de
// la suscripción (equipo interno / pruebas).
export const CUENTAS_EXENTAS = [
  'desarrollosdos@gmail.com',
  'lucasanzone@gmail.com',
  'sofiasanzone@gmail.com',
];

export function trialActivo(cuenta) {
  return (
    !!cuenta &&
    cuenta.plan === 'trial' &&
    !!cuenta.trial_ends_at &&
    new Date(cuenta.trial_ends_at).getTime() > Date.now()
  );
}

// Días que quedan de trial, redondeado hacia arriba (para no mostrar
// "0 días" mientras todavía queda una fracción del último día).
// Nunca negativo ni mayor a TRIAL_DIAS.
export function diasTrialRestantes(cuenta) {
  if (!trialActivo(cuenta)) return 0;
  const ms = new Date(cuenta.trial_ends_at).getTime() - Date.now();
  return Math.min(TRIAL_DIAS, Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24))));
}

// Acceso a las funciones generales de la app: cargar sucursales,
// empleados, contenido, agregar cursos de biblioteca, ver progreso,
// etc. Incluye trial vigente (sin topes).
export function tieneAccesoBase(cuenta, email) {
  return (
    CUENTAS_EXENTAS.includes(email) ||
    cuenta?.plan === 'active' ||
    cuenta?.plan === 'past_due' ||
    trialActivo(cuenta)
  );
}

// Acceso específico a las funciones que usan IA: generar curso nuevo,
// actualizar/regenerar curso publicado, chat de dudas del empleado, y
// lectura de imágenes/audio al cargar contenido. NUNCA durante el
// trial, aunque el resto de la app sí esté disponible — necesita
// suscripción real (o cuenta exenta).
export function puedeUsarIA(cuenta, email) {
  return CUENTAS_EXENTAS.includes(email) || cuenta?.plan === 'active' || cuenta?.plan === 'past_due';
}
