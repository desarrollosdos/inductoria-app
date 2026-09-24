// Inductoria · Edge Functions: autenticación del empleado (token + PIN)
// ------------------------------------------------
// El empleado no tiene cuenta: entra con un link que trae su token de
// acceso y confirma con un PIN de 4 dígitos. Antes el PIN solo se pedía
// en la pantalla (PinGate.jsx) y el servidor aceptaba el token solo, así
// que cualquiera con el link podía saltearse el PIN llamando a las
// funciones directo. Ahora TODAS las funciones del empleado validan acá
// token + PIN en cada pedido.
//
// Contrato:
// - El PIN viaja siempre en el header `x-empleado-pin` (nunca en la URL,
//   para que no quede en logs ni en el historial del navegador).
// - Errores: { error: <mensaje para mostrar>, codigo: <ver CODIGOS> }.
//   El frontend mira `codigo` (no solo el status) para saber si tiene
//   que volver a pedir el PIN.
// - Protección contra fuerza bruta: 5 PIN incorrectos seguidos bloquean
//   a ese empleado 15 minutos (columnas empleados.pin_intentos_fallidos y
//   empleados.pin_bloqueado_hasta, ver supabase/sql/2026-09-24-empleados-seguridad.sql).

// deno-lint-ignore-file no-explicit-any

export const HEADER_PIN = 'x-empleado-pin';

// CORS común a todas las funciones del empleado: suma el header del PIN.
export const corsEmpleado = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': `authorization, x-client-info, apikey, content-type, ${HEADER_PIN}`,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const MAX_INTENTOS_PIN = 5;
export const MINUTOS_BLOQUEO_PIN = 15;

export const CODIGOS = {
  LINK_INVALIDO: 'link_invalido',
  PIN_REQUERIDO: 'pin_requerido',
  PIN_INCORRECTO: 'pin_incorrecto',
  PIN_BLOQUEADO: 'pin_bloqueado',
  ERROR_SERVIDOR: 'error_servidor',
} as const;

export const MENSAJE_LINK_INVALIDO = 'Este link no funciona. Pedile uno nuevo a tu encargado.';
export const MENSAJE_ERROR_SERVIDOR = 'Hubo un problema de nuestro lado. Probá de nuevo en un rato.';

export interface EmpleadoAutenticado {
  id: string;
  nombre: string;
  puesto: string | null;
  foto_url: string | null;
  fecha_alta: string | null;
  negocio_id: string;
}

export interface ErrorAuth {
  status: number;
  mensaje: string;
  codigo: string;
}

export type ResultadoAuth = { empleado: EmpleadoAutenticado; error?: undefined } | { empleado?: undefined; error: ErrorAuth };

export function respuestaJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsEmpleado, 'Content-Type': 'application/json' },
  });
}

export function respuestaError(err: ErrorAuth) {
  return respuestaJson({ error: err.mensaje, codigo: err.codigo }, err.status);
}

// Respuesta genérica para errores inesperados: el detalle va solo al log,
// nunca al navegador del empleado.
export function respuestaErrorServidor(err: unknown) {
  console.error(err);
  return respuestaJson({ error: MENSAJE_ERROR_SERVIDOR, codigo: CODIGOS.ERROR_SERVIDOR }, 500);
}

export function leerPin(req: Request): string | null {
  const pin = req.headers.get(HEADER_PIN);
  return pin ? pin.trim() : null;
}

const COLUMNAS_BASE = 'id, nombre, puesto, foto_url, fecha_alta, negocio_id, fecha_baja, pin';
const COLUMNAS_BLOQUEO = 'pin_intentos_fallidos, pin_bloqueado_hasta';

function pinCoincide(guardado: unknown, ingresado: string) {
  if (guardado === null || guardado === undefined) return false;
  if (String(guardado).trim() === ingresado) return true;
  // Por si la columna fuera numérica: "0123" contra 123.
  return typeof guardado === 'number' && guardado === Number(ingresado);
}

function minutosRestantes(hasta: string) {
  const ms = new Date(hasta).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 60000));
}

function mensajeBloqueo(minutos: number) {
  return `Pusiste mal el PIN muchas veces. Esperá ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} y probá de nuevo.`;
}

// Valida token + PIN y devuelve el empleado (sin el PIN), o el error listo
// para devolver. Usa el cliente con service role.
export async function autenticarEmpleado(
  supabase: any,
  token: unknown,
  pin: unknown
): Promise<ResultadoAuth> {
  if (typeof token !== 'string' || !token.trim() || token.length > 200) {
    return { error: { status: 400, mensaje: MENSAJE_LINK_INVALIDO, codigo: CODIGOS.LINK_INVALIDO } };
  }
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return {
      error: {
        status: 401,
        mensaje: pin ? 'El PIN tiene que tener 4 números.' : 'Ingresá tu PIN para seguir.',
        codigo: CODIGOS.PIN_REQUERIDO,
      },
    };
  }

  let conBloqueo = true;
  let { data: fila, error } = await supabase
    .from('empleados')
    .select(`${COLUMNAS_BASE}, ${COLUMNAS_BLOQUEO}`)
    .eq('token_acceso', token)
    .maybeSingle();

  // Si todavía no se corrió el SQL de las columnas de bloqueo (42703 =
  // columna inexistente), seguimos validando el PIN igual, sin el tope de
  // intentos, para no dejar a nadie afuera por el orden del deploy.
  if (error && error.code === '42703') {
    console.warn('Faltan las columnas de bloqueo de PIN en empleados. Corré 2026-09-24-empleados-seguridad.sql.');
    conBloqueo = false;
    ({ data: fila, error } = await supabase
      .from('empleados')
      .select(COLUMNAS_BASE)
      .eq('token_acceso', token)
      .maybeSingle());
  }

  if (error) {
    console.error('autenticarEmpleado:', error);
    return { error: { status: 500, mensaje: MENSAJE_ERROR_SERVIDOR, codigo: CODIGOS.ERROR_SERVIDOR } };
  }

  // Link inexistente o empleado dado de baja: mismo mensaje, para no dar
  // pistas de cuál de las dos cosas pasó.
  if (!fila || fila.fecha_baja) {
    return { error: { status: 404, mensaje: MENSAJE_LINK_INVALIDO, codigo: CODIGOS.LINK_INVALIDO } };
  }

  // Bloqueado: ni siquiera se mira el PIN (si no, se podría seguir
  // probando durante el bloqueo y ver cuál da distinto).
  if (conBloqueo && fila.pin_bloqueado_hasta && new Date(fila.pin_bloqueado_hasta).getTime() > Date.now()) {
    return {
      error: { status: 403, mensaje: mensajeBloqueo(minutosRestantes(fila.pin_bloqueado_hasta)), codigo: CODIGOS.PIN_BLOQUEADO },
    };
  }

  if (!pinCoincide(fila.pin, pin)) {
    if (!conBloqueo) {
      return { error: { status: 401, mensaje: 'El PIN no es correcto.', codigo: CODIGOS.PIN_INCORRECTO } };
    }
    return await registrarFallo(supabase, fila.id, fila.pin_intentos_fallidos ?? 0);
  }

  // PIN correcto: si venía con intentos fallidos o un bloqueo vencido,
  // se limpia el contador.
  if (conBloqueo && ((fila.pin_intentos_fallidos ?? 0) > 0 || fila.pin_bloqueado_hasta)) {
    const { error: resetError } = await supabase
      .from('empleados')
      .update({ pin_intentos_fallidos: 0, pin_bloqueado_hasta: null })
      .eq('id', fila.id);
    if (resetError) console.error('No se pudo resetear el contador de PIN:', resetError);
  }

  return {
    empleado: {
      id: fila.id,
      nombre: fila.nombre,
      puesto: fila.puesto ?? null,
      foto_url: fila.foto_url ?? null,
      fecha_alta: fila.fecha_alta ?? null,
      negocio_id: fila.negocio_id,
    },
  };
}

// Suma un intento fallido. El update es condicional al valor leído
// (control optimista) para que dos intentos simultáneos no cuenten como
// uno solo; si alguien se nos adelantó, se relee y se reintenta.
async function registrarFallo(supabase: any, empleadoId: string, intentosLeidos: number): Promise<ResultadoAuth> {
  let actuales = intentosLeidos;
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const nuevos = actuales + 1;
    const bloquea = nuevos >= MAX_INTENTOS_PIN;
    const cambios = bloquea
      ? { pin_intentos_fallidos: 0, pin_bloqueado_hasta: new Date(Date.now() + MINUTOS_BLOQUEO_PIN * 60000).toISOString() }
      : { pin_intentos_fallidos: nuevos };

    const { data: actualizado, error } = await supabase
      .from('empleados')
      .update(cambios)
      .eq('id', empleadoId)
      .eq('pin_intentos_fallidos', actuales)
      .select('id');

    if (error) {
      console.error('No se pudo registrar el intento fallido de PIN:', error);
      break;
    }
    if (actualizado && actualizado.length > 0) {
      if (bloquea) {
        return { error: { status: 403, mensaje: mensajeBloqueo(MINUTOS_BLOQUEO_PIN), codigo: CODIGOS.PIN_BLOQUEADO } };
      }
      const quedan = MAX_INTENTOS_PIN - nuevos;
      return {
        error: {
          status: 401,
          mensaje: `El PIN no es correcto. Te ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`}.`,
          codigo: CODIGOS.PIN_INCORRECTO,
        },
      };
    }

    const { data: releido } = await supabase
      .from('empleados')
      .select('pin_intentos_fallidos, pin_bloqueado_hasta')
      .eq('id', empleadoId)
      .maybeSingle();
    if (releido?.pin_bloqueado_hasta && new Date(releido.pin_bloqueado_hasta).getTime() > Date.now()) {
      return {
        error: { status: 403, mensaje: mensajeBloqueo(minutosRestantes(releido.pin_bloqueado_hasta)), codigo: CODIGOS.PIN_BLOQUEADO },
      };
    }
    actuales = releido?.pin_intentos_fallidos ?? 0;
  }
  return { error: { status: 401, mensaje: 'El PIN no es correcto.', codigo: CODIGOS.PIN_INCORRECTO } };
}

// ------------------------------------------------------------------
// Acceso a cursos
// ------------------------------------------------------------------

// Mismo criterio que empleado-info para listar: sin puestos_aplicables
// (null o vacío) = todavía no se publicó para nadie; 'TODOS' = cualquier
// puesto; lista puntual = solo esos puestos.
export function aplicaAlPuesto(puestos: string[] | null | undefined, puestoEmpleado: string | null) {
  if (!puestos || puestos.length === 0) return false;
  if (puestos.includes('TODOS')) return true;
  return !!puestoEmpleado && puestos.includes(puestoEmpleado);
}

export async function obtenerCuentaId(supabase: any, negocioId: string): Promise<string | null> {
  const { data, error } = await supabase.from('negocios').select('cuenta_id').eq('id', negocioId).maybeSingle();
  if (error) throw error;
  return data?.cuenta_id ?? null;
}

// Un empleado solo puede ver/rendir/preguntar sobre un curso publicado
// ('aprobado'), de su misma cuenta y asignado a su puesto. Mismo filtro
// que usa empleado-info para armar la lista de "Mi perfil".
export function cursoAccesible<
  T extends { cuenta_id?: string | null; estado?: string | null; puestos_aplicables?: string[] | null },
>(microcurso: T | null | undefined, cuentaIdEmpleado: string | null, puestoEmpleado: string | null): microcurso is T {
  return (
    !!microcurso &&
    !!cuentaIdEmpleado &&
    microcurso.cuenta_id === cuentaIdEmpleado &&
    microcurso.estado === 'aprobado' &&
    aplicaAlPuesto(microcurso.puestos_aplicables, puestoEmpleado)
  );
}

export const MENSAJE_CURSO_NO_DISPONIBLE = 'Este curso no está disponible. Volvé a Mi perfil para ver tus cursos.';

// ------------------------------------------------------------------
// Versiones de curso (progreso_empleado tiene una fila por versión desde
// 2026-09-07)
// ------------------------------------------------------------------

// Versión a la que corresponde una fila de progreso. Las filas de antes
// del cambio no tienen `version`: se toma version_completada y, si
// tampoco hay, la 1 (el curso arrancó en 1 y solo sube al actualizarlo).
export function versionDeFila(p: { version?: number | null; version_completada?: number | null }) {
  return p.version ?? p.version_completada ?? 1;
}

// De todas las filas de un empleado para UN curso, la que cuenta para la
// versión actual. Si hubiera más de una (por ejemplo una fila vieja sin
// `version` y otra nueva de la misma versión), prioriza la aprobada y
// después la de fecha más reciente.
export function filaDeVersion<T extends { version?: number | null; version_completada?: number | null; completado?: boolean | null; fecha_completado?: string | null }>(
  filas: T[],
  version: number
): T | null {
  const candidatas = filas.filter((p) => versionDeFila(p) === version);
  if (candidatas.length === 0) return null;
  // La que tiene `version` explícita gana sobre la legacy, a igualdad.
  candidatas.sort((a, b) => {
    if (!!a.completado !== !!b.completado) return a.completado ? -1 : 1;
    if ((a.version != null) !== (b.version != null)) return a.version != null ? -1 : 1;
    return String(b.fecha_completado || '').localeCompare(String(a.fecha_completado || ''));
  });
  return candidatas[0];
}

// La fila aprobada más reciente de una versión ANTERIOR a la actual (para
// avisar "contenido actualizado, revisalo de nuevo").
export function ultimaVersionAnteriorCompletada<T extends { version?: number | null; version_completada?: number | null; completado?: boolean | null; fecha_completado?: string | null }>(
  filas: T[],
  versionActual: number
): T | null {
  const anteriores = filas
    .filter((p) => p.completado && versionDeFila(p) < versionActual)
    .sort((a, b) => versionDeFila(b) - versionDeFila(a));
  return anteriores[0] ?? null;
}

// ------------------------------------------------------------------
// Fechas en hora de Argentina (UTC-3, sin horario de verano)
// ------------------------------------------------------------------

const OFFSET_ARGENTINA_MS = 3 * 60 * 60 * 1000;

// Un Date "corrido" 3 horas para leerlo con los getters UTC como si fuera
// la hora local de Argentina.
export function ahoraArgentina(): Date {
  return new Date(Date.now() - OFFSET_ARGENTINA_MS);
}

// Instante (ISO, en UTC) en que empezó el día de hoy en Argentina.
export function inicioDelDiaArgentinaISO(): string {
  const hoy = ahoraArgentina().toISOString().slice(0, 10);
  return new Date(`${hoy}T00:00:00-03:00`).toISOString();
}
