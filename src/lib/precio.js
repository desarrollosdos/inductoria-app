// Inductoria · Cálculo de precio por cantidad de sucursales.
//
// Las proporciones de descuento por volumen quedan fijas relativas al
// precio de 1 sucursal (fueron $12.000 / $10.000 / $9.000 / $8.000).
// Si el precio base cambia desde Admin, estas proporciones se mantienen:
// por ejemplo "2 a 4 sucursales" siempre sale un 83,3% del precio base
// por sucursal, sea cual sea el precio base actual.

// Precio base (1 sucursal) que se usa si todavía no se pudo leer
// configuracion_precio. Tiene que ser el mismo número que usan como
// valor por defecto precio-publico (la landing), crear-suscripcion y
// agregar-sucursal-plan, para que nunca se muestre un precio y se cobre
// otro. Si cambia, hay que cambiarlo en esos tres lugares también.
export const PRECIO_BASE_POR_DEFECTO = 12000;

// Mismas proporciones copiadas en crear-suscripcion y
// agregar-sucursal-plan (las Edge Functions no pueden importar este
// archivo).
export const TIERS_PRECIO = [
  { hasta: 1, factor: 12000 / 12000, etiqueta: '1 sucursal' },
  { hasta: 4, factor: 10000 / 12000, etiqueta: '2 a 4 sucursales' },
  { hasta: 9, factor: 9000 / 12000, etiqueta: '5 a 9 sucursales' },
  { hasta: Infinity, factor: 8000 / 12000, etiqueta: '10 o más sucursales' },
];

export function precioPorSucursal(cantidadSucursales, precioBase) {
  const tier = TIERS_PRECIO.find((t) => cantidadSucursales <= t.hasta);
  const valor = precioBase * tier.factor;
  return Math.round(valor / 100) * 100;
}

export function precioTotalMensual(cantidadSucursales, precioBase) {
  return precioPorSucursal(cantidadSucursales, precioBase) * cantidadSucursales;
}