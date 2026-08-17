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
// sucursales), EXCEPTO las funciones que usan un modelo de IA con
// costo real (generar/actualizar cursos con Claude, chat de dudas del
// empleado con Claude, lectura de imágenes con Claude vision al cargar
// contenido), que requieren suscripción real. Esto es lo que mantiene
// acotado el riesgo de costo en signups que no convierten, sin tener
// que resignar el trial por completo.
//
// Ajuste 2026-08-17: transcribir audio (Groq Whisper) quedó afuera de
// este bloqueo y disponible en trial — a diferencia de Claude, Groq no
// tiene costo dentro de su límite gratis diario (8hs de audio/día), así
// que dejarlo abierto no suma riesgo económico y le deja ver al cliente
// potencial el flujo completo de "subir/grabar audio → texto" antes de
// pagar. Lo único que sigue bloqueado después de eso es el paso
// siguiente: generar el curso con IA a partir de ese texto.

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

// Tiempo que queda de trial, en días y horas (redondeado hacia arriba
// a la hora, para no mostrar "0" mientras todavía queda una fracción
// de la última hora). Antes esto solo devolvía días enteros
// redondeados hacia arriba (Math.ceil), lo que hacía que alguien que
// creó su cuenta ayer viera "7 días" tanto el primer día como el
// segundo (ceil de, por ej., 6.2 días sigue dando 7) — quedaba
// prácticamente estancado en el número inicial hasta el final. Con
// horas, "6 días y 14 horas" baja visiblemente de un día a otro.
export function tiempoTrialRestante(cuenta) {
  if (!trialActivo(cuenta)) return { dias: 0, horas: 0 };
  const ms = new Date(cuenta.trial_ends_at).getTime() - Date.now();
  const totalHoras = Math.min(TRIAL_DIAS * 24, Math.max(1, Math.ceil(ms / (1000 * 60 * 60))));
  return { dias: Math.floor(totalHoras / 24), horas: totalHoras % 24 };
}

// Mismo cálculo, ya armado como texto en español ("6 días y 14 horas",
// "1 día", "18 horas") para usar directo en la UI.
export function textoTrialRestante(cuenta) {
  const { dias, horas } = tiempoTrialRestante(cuenta);
  const txtDias = dias > 0 ? `${dias} día${dias === 1 ? '' : 's'}` : '';
  const txtHoras = horas > 0 ? `${horas} hora${horas === 1 ? '' : 's'}` : '';
  if (txtDias && txtHoras) return `${txtDias} y ${txtHoras}`;
  return txtDias || txtHoras || 'menos de 1 hora';
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

// Acceso específico a las funciones que usan IA con costo real (Claude):
// generar curso nuevo, actualizar/regenerar curso publicado, chat de
// dudas del empleado, y lectura de imágenes al cargar contenido. NUNCA
// durante el trial, aunque el resto de la app sí esté disponible —
// necesita suscripción real (o cuenta exenta). La transcripción de
// audio (Groq, gratis) NO pasa por acá — ver el comentario de más
// arriba.
export function puedeUsarIA(cuenta, email) {
  return CUENTAS_EXENTAS.includes(email) || cuenta?.plan === 'active' || cuenta?.plan === 'past_due';
}
