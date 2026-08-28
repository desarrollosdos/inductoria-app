// Inductoria · utilidades de texto
// -----------------------------------
// Dos variantes:
//
// - capitalizarPalabras: pone en mayúscula la primera letra de CADA
//   palabra, preservando los espacios tal cual estén ("juan perez" ->
//   "Juan Perez"). Es la que se usa en TODOS los campos de entrada libre
//   que son nombres/identificadores cortos, no oraciones: nombre de
//   empleado, nombre de sucursal, localidad, provincia, país, dirección,
//   y los títulos de Contenido/Procedimientos/Checklists.
//
//   2026-08-28: antes los títulos usaban capitalizarPrimeraLetra, porque
//   en español no es lo más prolijo poner en mayúscula cada palabra de
//   una oración ("Manipulación De Alimentos" en vez de "Manipulación de
//   alimentos"). Roberto pidió explícitamente el mismo criterio de "cada
//   palabra en mayúscula" para todos los campos de entrada de la app,
//   títulos incluidos, así que ahora también usan capitalizarPalabras.
//
// - capitalizarPrimeraLetra: pone en mayúscula solo la primera letra de
//   TODO el texto, sin tocar el resto de las palabras. Ya no se usa en
//   ningún lado por ahora, queda disponible por si hace falta en el
//   futuro para un campo de una sola oración larga.
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