// Inductoria · utilidades de texto
// -----------------------------------
// Dos variantes:
//
// - capitalizarPalabras: pone en mayúscula la primera letra de CADA
//   palabra, preservando los espacios tal cual estén ("juan perez" ->
//   "Juan Perez"). Solo para nombres propios cortos: nombre de empleado,
//   nombre de sucursal, localidad, provincia, puesto personalizado.
//
// - capitalizarPrimeraLetra: pone en mayúscula solo la primera letra de
//   TODO el texto, sin tocar el resto. Es la que va en títulos y frases
//   (cursos, procedimientos, checklists y sus ítems): en español se
//   escribe "Contar la caja", no "Contar La Caja". Antes los títulos
//   usaban capitalizarPalabras y quedaban con cada palabra en mayúscula.
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