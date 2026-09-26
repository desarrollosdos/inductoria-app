import { useEffect, useState } from 'react';
import {
  onInstalacionDisponible,
  onAppInstalada,
  hayInstalacionDisponible,
  instalarApp,
  appYaInstalada,
  detectarNavegador,
} from '../lib/instalarApp';

// Tarjeta fija en Ayuda para instalar Inductoria en la computadora.
// Complementa al cartel de primer ingreso (InstalarAppPrompt.jsx), que
// aparece una sola vez: si el dueño tocó "Ahora no", acá lo puede hacer
// cuando quiera.
//  - Chrome/Edge con instalación disponible: botón que abre el diálogo
//    nativo del navegador.
//  - Cualquier otro caso (Safari, Firefox, o Chrome sin el evento):
//    paso a paso manual según el navegador detectado, y un desplegable
//    con el resto de los navegadores por si la detección no acierta.

const PASOS = {
  chrome: {
    nombre: 'Google Chrome',
    pasos: [
      'Mirá a la derecha de la barra de direcciones: aparece un ícono de una pantalla con una flecha. Hacé clic ahí.',
      'Si no lo ves, abrí el menú de los tres puntos (arriba a la derecha) y buscá la opción "Instalar Inductoria".',
      'Confirmá con "Instalar". Te queda un acceso en el escritorio y en el menú Inicio.',
    ],
  },
  edge: {
    nombre: 'Microsoft Edge',
    pasos: [
      'Mirá a la derecha de la barra de direcciones: aparece un ícono para instalar la app. Hacé clic ahí.',
      'Si no lo ves, abrí el menú de los tres puntos (arriba a la derecha), entrá en "Aplicaciones" y elegí "Instalar Inductoria".',
      'Confirmá con "Instalar". Te queda un acceso en el escritorio y en el menú Inicio.',
    ],
  },
  'safari-mac': {
    nombre: 'Safari en Mac',
    pasos: [
      'Con Inductoria abierto, andá al menú "Archivo" de la barra de arriba.',
      'Elegí "Añadir al Dock" y confirmá.',
      'Si no te aparece esa opción, actualizá macOS o usá Chrome o Edge.',
    ],
  },
  'safari-ios': {
    nombre: 'iPhone o iPad',
    pasos: [
      'Abrí Inductoria en Safari.',
      'Tocá el botón de compartir (el cuadrado con una flecha hacia arriba).',
      'Elegí "Agregar a pantalla de inicio" y confirmá.',
    ],
  },
  firefox: {
    nombre: 'Firefox',
    pasos: [
      'Firefox en computadora no permite instalar páginas como app.',
      'Abrí app.inductoria.com.ar en Chrome o Edge y seguí los pasos de ese navegador.',
      'Si preferís seguir en Firefox, guardala en marcadores para tenerla a mano.',
    ],
  },
};

const ORDEN_OTROS = ['chrome', 'edge', 'safari-mac', 'safari-ios', 'firefox'];

function IconDescargar(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
      <path d="M12 7v5" />
      <path d="m9.5 9.5 2.5 2.5 2.5-2.5" />
    </svg>
  );
}

function ListaPasos({ pasos }) {
  return (
    <ol className="list-decimal pl-5 space-y-1.5 text-sm text-[#3d382c]">
      {pasos.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ol>
  );
}

export default function InstalarAppAyuda() {
  const [instalada, setInstalada] = useState(() => appYaInstalada());
  const [disponible, setDisponible] = useState(() => hayInstalacionDisponible());
  const [instalando, setInstalando] = useState(false);
  const [verOtros, setVerOtros] = useState(false);
  const navegador = detectarNavegador();

  useEffect(() => {
    const desuscribirDisponible = onInstalacionDisponible(() => setDisponible(true));
    const desuscribirInstalada = onAppInstalada(() => {
      setInstalada(true);
      setDisponible(false);
    });
    return () => {
      desuscribirDisponible();
      desuscribirInstalada();
    };
  }, []);

  async function handleInstalar() {
    setInstalando(true);
    const resultado = await instalarApp();
    setInstalando(false);
    // El evento del navegador se usa una sola vez: si el dueño cancela el
    // diálogo, pasamos a mostrar el paso a paso manual.
    setDisponible(false);
    if (resultado?.outcome === 'accepted') setInstalada(true);
  }

  const propio = PASOS[navegador];
  const otros = ORDEN_OTROS.filter((id) => id !== navegador);

  return (
    <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-[#EDE0C8] text-[#C1502E]">
          <IconDescargar />
        </div>
        <h2 className="font-bold tracking-wide text-[#C1502E]">Instalar Inductoria en tu computadora</h2>
      </div>

      {instalada ? (
        <p className="text-sm font-semibold tracking-wide text-[#3d382c]">
          Ya la tenés instalada. La abrís desde el acceso del escritorio o del menú Inicio, sin pasar por el navegador.
        </p>
      ) : (
        <>
          <p className="text-sm text-[#3d382c] mb-4">
            Te queda un ícono propio y la abrís directo, como cualquier otro programa.
          </p>

          {disponible ? (
            <button
              type="button"
              onClick={handleInstalar}
              disabled={instalando}
              className="px-5 py-2 rounded-lg text-xs font-bold tracking-wide text-white bg-[#C1502E] disabled:opacity-60"
              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
            >
              {instalando ? 'Instalando...' : 'Instalar app'}
            </button>
          ) : propio ? (
            <div>
              <p className="text-sm font-semibold tracking-wide text-[#2C2C2A] mb-2">En {propio.nombre}:</p>
              <ListaPasos pasos={propio.pasos} />
            </div>
          ) : (
            <p className="text-sm text-[#3d382c]">
              Tu navegador puede no permitir instalar páginas como app. Te recomendamos abrir app.inductoria.com.ar en Chrome o Edge.
            </p>
          )}

          <button
            type="button"
            onClick={() => setVerOtros((v) => !v)}
            className="mt-4 text-xs font-semibold tracking-wide text-[#6B655A] underline"
          >
            {verOtros ? 'Ocultar otros navegadores' : '¿Usás otro navegador?'}
          </button>

          {verOtros && (
            <div className="mt-3 space-y-4">
              {otros.map((id) => (
                <div key={id}>
                  <p className="text-sm font-semibold tracking-wide text-[#2C2C2A] mb-1.5">{PASOS[id].nombre}</p>
                  <ListaPasos pasos={PASOS[id].pasos} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
