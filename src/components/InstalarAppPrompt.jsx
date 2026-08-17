import { useEffect, useState } from 'react';
import {
  onInstalacionDisponible,
  hayInstalacionDisponible,
  instalarApp,
  appYaInstalada,
  yaSePregunto,
  marcarPreguntado,
} from '../lib/instalarApp';

// Cartel que aparece una sola vez, en el primer ingreso logueado desde
// un navegador que soporta instalación por código (Chrome/Edge,
// desktop o Android), ofreciendo instalar Inductoria con ícono propio.
// En Safari y Firefox nunca aparece — no es un error, esos navegadores
// no tienen forma de disparar la instalación desde la página (ver el
// comentario en lib/instalarApp.js).
export default function InstalarAppPrompt() {
  const [visible, setVisible] = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    if (appYaInstalada() || yaSePregunto()) return;

    function mostrarSiCorresponde() {
      if (appYaInstalada() || yaSePregunto()) return;
      // Pequeño delay para no competir con la carga inicial de la
      // pantalla recién logueada.
      setTimeout(() => setVisible(true), 1500);
    }

    if (hayInstalacionDisponible()) {
      mostrarSiCorresponde();
      return undefined;
    }
    return onInstalacionDisponible(mostrarSiCorresponde);
  }, []);

  async function handleInstalar() {
    setInstalando(true);
    await instalarApp();
    setInstalando(false);
    setVisible(false);
    marcarPreguntado();
  }

  function handleDescartar() {
    setVisible(false);
    marcarPreguntado();
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm px-4 sm:px-0">
      <div className="bg-white rounded-2xl border border-[#EFDDCE] shadow-lg p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#2C2C2A] flex items-center justify-center flex-shrink-0">
          <svg width="22" height="22" viewBox="0 0 120 120">
            <rect x="15" y="10" width="90" height="100" rx="14" fill="#FDF6EF" />
            <circle cx="60" cy="33" r="14" fill="#C1502E" />
            <rect x="40" y="57" width="40" height="6" rx="3" fill="#2C2C2A" />
            <rect x="40" y="70" width="40" height="6" rx="3" fill="#cbbf9c" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#2C2C2A] mb-0.5">¿Instalar Inductoria en esta compu?</p>
          <p className="text-xs text-[#6b6455] mb-3">
            Se agrega un ícono propio y la abrís directo, sin pasar por el navegador.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDescartar}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-[#8a8471] bg-[#EDE0C8]"
            >
              Ahora no
            </button>
            <button
              type="button"
              onClick={handleInstalar}
              disabled={instalando}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#C1502E] disabled:opacity-60"
            >
              {instalando ? 'Instalando...' : 'Instalar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
