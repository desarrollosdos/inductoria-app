import { trialActivo, textoTrialRestante } from '../lib/acceso';
import PrecioCambioBanner from './PrecioCambioBanner';

// Aviso liviano de "te quedan X de prueba", visible en las pantallas
// principales mientras la cuenta está en trial. No bloquea nada, solo
// recuerda y ofrece el atajo a Suscripción.
// Desde 2026-09-25 también muestra, debajo, el aviso de cambio de precio
// programado (PrecioCambioBanner), así aparece en las mismas pantallas.
export default function TrialBanner({ cuenta }) {
  return (
    <>
      {trialActivo(cuenta) && <AvisoTrial cuenta={cuenta} />}
      <PrecioCambioBanner cuenta={cuenta} />
    </>
  );
}

function AvisoTrial({ cuenta }) {
  const tiempoRestante = textoTrialRestante(cuenta);

  return (
    <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-sm">
      <span className="text-[#6b6455]">
        Te quedan <strong className="text-[#2C2C2A]">{tiempoRestante}</strong> de prueba gratis.
        Para generar cursos y procedimientos con IA tenés que suscribirte.
      </span>
      <a
        href="/"
        className="text-xs font-semibold text-white bg-[#C1502E] rounded-full px-3 py-1.5 whitespace-nowrap flex-shrink-0"
      >
        Suscribirme
      </a>
    </div>
  );
}
