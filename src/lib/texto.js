// Inductoria · utilidades de texto
// -----------------------------------
// Dos variantes, para dos casos distintos:
//
// - capitalizarPrimeraLetra: pone en mayúscula solo la primera letra de
//   TODO el texto, sin tocar el resto de las palabras. Se usa en títulos
//   (contenidos, procedimientos), donde poner en mayúscula cada palabra
//   queda mal ("Manipulación De Alimentos" en vez de "Manipulación de
//   alimentos").
// - capitalizarPalabras: pone en mayúscula la primera letra de CADA
//   palabra, preservando los espacios tal cual estén. Se usa en nombres
//   propios que pueden ser compuestos (nombre de una sucursal, nombre de
//   un empleado con nombre y apellido en el mismo campo), donde sí
//   corresponde que cada palabra arranque en mayúscula ("juan perez" ->
//   "Juan Perez").
//
// Ninguna de las dos toca el resto de cada palabra (no fuerza minúsculas):
// si alguien ya escribió "JUAN", queda "JUAN", solo se asegura que la
// primera letra esté en mayúscula.

export function capitalizarPrimeraLetra(texto) {
  if (!texto) return texto;
  const limpio = texto.trim();
  if (!limpio) return limpio;
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

export function capitalizarPalabras(texto) {
  if (!texto) return texto;
  const limpio = texto.trim();
  if (!limpio) return limpio;
  return limpio
    .split(/(\s+)/)
    .map((parte) => (parte.trim() ? parte.charAt(0).toUpperCase() + parte.slice(1) : parte))
    .join('');
}
