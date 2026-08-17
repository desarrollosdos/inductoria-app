// Inductoria · Instalar como app de escritorio
// ------------------------------------------------
// El navegador dispara el evento "beforeinstallprompt" en algún
// momento después de cargar la página, si el sitio cumple los
// requisitos técnicos para ser instalable (ya están armados desde
// antes: public/manifest.json con íconos 192/512 y public/sw.js,
// registrado en main.jsx). El evento se dispara UNA sola vez y hay que
// guardarlo apenas aparece — por eso este módulo se importa de entrada
// en main.jsx, antes de que React monte nada, para no arriesgarse a
// perderlo si tarda en dispararse.
//
// Esto solo funciona en Chrome y Edge (desktop y Android) — es la
// única familia de navegadores que soporta este evento. Safari
// (Mac/iPhone/iPad) y Firefox nunca lo disparan: en esos navegadores
// no hay forma de disparar la instalación por código, solo el
// "Agregar a pantalla de inicio"/"Agregar al Dock" manual del propio
// navegador. Por eso el cartel de instalación (InstalarAppPrompt.jsx)
// simplemente no aparece ahí — no es un bug, es la única opción real.

const CLAVE_YA_PREGUNTADO = 'inductoria_instalar_preguntado';

let eventoDiferido = null;
let listeners = [];

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Frenamos el mini-cartel automático del navegador: preferimos
    // mostrar nuestro propio cartel, con nuestro texto, en el momento
    // que elijamos (primer ingreso logueado) en vez de cuando Chrome
    // decida mostrarlo por su cuenta.
    e.preventDefault();
    eventoDiferido = e;
    listeners.forEach((cb) => cb());
  });

  window.addEventListener('appinstalled', () => {
    eventoDiferido = null;
    marcarPreguntado(); // si se instaló por cualquier vía, no preguntar más
  });
}

// Se suscribe para enterarse apenas el evento esté disponible — puede
// que ya lo esté al momento de llamar, o puede tardar un poco más en
// dispararse. Devuelve una función para desuscribirse.
export function onInstalacionDisponible(callback) {
  if (eventoDiferido) {
    callback();
    return () => {};
  }
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

export function hayInstalacionDisponible() {
  return !!eventoDiferido;
}

// Dispara el diálogo nativo del navegador para instalar. Devuelve
// { outcome: 'accepted' | 'dismissed', platform } o null si ya no
// había ningún evento guardado (por ejemplo, si el usuario ya la
// instaló entre que apareció el cartel y que apretó "Instalar").
export async function instalarApp() {
  if (!eventoDiferido) return null;
  const evento = eventoDiferido;
  eventoDiferido = null;
  evento.prompt();
  return evento.userChoice;
}

export function appYaInstalada() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true
  );
}

export function yaSePregunto() {
  try {
    return localStorage.getItem(CLAVE_YA_PREGUNTADO) === '1';
  } catch {
    return false;
  }
}

export function marcarPreguntado() {
  try {
    localStorage.setItem(CLAVE_YA_PREGUNTADO, '1');
  } catch {
    // localStorage puede fallar en navegación privada; no es crítico,
    // en el peor caso vuelve a preguntar la próxima vez.
  }
}
