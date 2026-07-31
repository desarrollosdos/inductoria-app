// Inductoria · Service Worker mínimo
// ------------------------------------------------
// Esto no cachea nada todavía (no hace falta para el problema que
// estamos resolviendo), pero es requisito de Chrome/Android para
// reconocer el sitio como una app instalable de verdad, en vez de
// caer al modo "acceso directo" con el ícono genérico del navegador.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Sin lógica de cache por ahora, dejamos pasar todo tal cual.
});
