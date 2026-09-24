// Inductoria · Edge Functions: utilidades compartidas del panel de Admin
// ------------------------------------------------
// 1. esAdministrador(): antes cada función de Admin (admin-metrics,
//    admin-costo-ia, admin-visitas, actualizar-precio) comparaba el mail
//    contra un string fijo. La lista real de administradores ya vive en
//    la base (tabla `administradores`, la misma que usa App.jsx vía el
//    RPC es_administrador()), así que acá preguntamos lo mismo: sumar o
//    sacar un administrador desde el panel ahora también aplica a estas
//    funciones, sin tocar código ni volver a desplegar.
//
//    El RPC se llama con la anon key + el Authorization del que llama
//    (NO con service role): es_administrador() mira el usuario del JWT,
//    y con service role no habría usuario y daría siempre false.
//
// 2. traerTodasLasFilas(): Supabase corta cada select en 1000 filas sin
//    avisar. Para métricas eso subestima todo en silencio apenas una
//    tabla pasa ese tamaño, así que paginamos con .range() hasta agotar.
//
// 3. Fechas en hora de Argentina: "hoy" y "este mes" tienen que ser los
//    de Argentina (UTC-3, sin horario de verano), no los del servidor
//    (UTC). Si no, entre las 21 y las 24 hs de Argentina ya cuenta como
//    "mañana".

import { createClient } from 'jsr:@supabase/supabase-js@2';

export interface UsuarioAdmin {
  id: string;
  email: string | null;
}

// Devuelve el usuario si es administrador, o null si no lo es (o si el
// token no es válido). Cualquier error del RPC cuenta como "no es
// administrador": ante la duda, cerramos.
export async function obtenerAdministrador(authHeader: string | null): Promise<UsuarioAdmin | null> {
  if (!authHeader) return null;

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: userData, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !userData?.user) return null;

  const { data: esAdmin, error: rpcError } = await supabaseUser.rpc('es_administrador');
  if (rpcError) {
    console.error('esAdministrador: falló el RPC es_administrador', rpcError);
    return null;
  }
  if (esAdmin !== true) return null;

  return { id: userData.user.id, email: userData.user.email ?? null };
}

export async function esAdministrador(authHeader: string | null): Promise<boolean> {
  return (await obtenerAdministrador(authHeader)) !== null;
}

// Pagina un select hasta traer todas las filas. `armarConsulta` recibe
// el rango (desde, hasta) y tiene que devolver la consulta ya armada con
// .range(desde, hasta) y un .order() estable (si no, las páginas pueden
// repetir o saltear filas).
// deno-lint-ignore no-explicit-any
export async function traerTodasLasFilas<T = any>(
  // deno-lint-ignore no-explicit-any
  armarConsulta: (desde: number, hasta: number) => PromiseLike<{ data: any; error: any }>,
  tamanioPagina = 1000
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += tamanioPagina) {
    const { data, error } = await armarConsulta(desde, desde + tamanioPagina - 1);
    if (error) throw error;
    const pagina = (data || []) as T[];
    filas.push(...pagina);
    if (pagina.length < tamanioPagina) break;
  }
  return filas;
}

// Argentina está fija en UTC-3 (no tiene horario de verano desde 2009).
const OFFSET_ARGENTINA_MS = 3 * 60 * 60 * 1000;

// Fecha local de Argentina como 'AAAA-MM-DD'.
export function fechaArgentina(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
  return new Date(d.getTime() - OFFSET_ARGENTINA_MS).toISOString().slice(0, 10);
}

// Instante (en UTC) en que arrancó el día de hoy en Argentina.
export function inicioDelDiaArgentina(ahora: Date = new Date()): Date {
  const local = new Date(ahora.getTime() - OFFSET_ARGENTINA_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + OFFSET_ARGENTINA_MS
  );
}

// Instante (en UTC) en que arrancó el mes en curso en Argentina.
export function inicioDelMesArgentina(ahora: Date = new Date()): Date {
  const local = new Date(ahora.getTime() - OFFSET_ARGENTINA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + OFFSET_ARGENTINA_MS);
}
