import { trialActivo, diasTrialRestantes } from '../lib/acceso';

// Aviso liviano de "te quedan N días de prueba", visible en las
// pantallas principales mientras la cuenta está en trial. No bloquea
// nada, solo recuerda y ofrece el atajo a Suscripción.
export default function TrialBanner({ cuenta }) {
  if (!trialActivo(cuenta)) return null;

  const dias = diasTrialRestantes(cuenta);

  return (
    <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-sm">
      <span className="text-[#6b6455]">
        Te quedan <strong className="text-[#2C2C2A]">{dias}</strong> día{dias === 1 ? '' : 's'} de
        prueba gratis. Generar cursos con IA requiere suscripción.
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
