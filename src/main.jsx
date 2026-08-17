// Importado de entrada, antes de todo lo demás: engancha el listener
// de "beforeinstallprompt" apenas arranca la página, para no arriesgarse
// a perder el evento si el navegador lo dispara temprano (ver el
// comentario dentro del archivo).
import './lib/instalarApp';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Requisito de Chrome/Android para que la app sea instalable de verdad
// (con su propio ícono), en vez de caer al modo "acceso directo".
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('No se pudo registrar el service worker:', err);
    });
  });
}
