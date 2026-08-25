// Inductoria · utilidades de texto
// -----------------------------------
// capitalizarPrimeraLetra: pone en mayúscula solo la primera letra de un
// texto, sin tocar el resto (no es un Title Case por palabra: "manipulación
// de alimentos" -> "Manipulación de alimentos", no "Manipulación De
// Alimentos"). Se usa al guardar nombres de sucursales, empleados, y
// títulos de contenidos y procedimientos, para que si alguien lo escribe
// todo en minúscula, quede prolijo igual.

export function capitalizarPrimeraLetra(texto) {
  if (!texto) return texto;
  const limpio = texto.trim();
  if (!limpio) return limpio;
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}
