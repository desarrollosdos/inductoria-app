// Modal compartido: se muestra cuando el dueño intenta usar una función
// real (crear, generar, publicar) sin tener una suscripción activa
// (ni active ni past_due). Mismo criterio de mensaje que el cartel de
// bloqueo de Repunte.
export default function SuscripcionRequeridaModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-sm w-full border border-[#EFDDCE] text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-bold text-[#2C2C2A] mb-2">
          Activá tu suscripción para seguir usando Inductoria
        </p>
        <p className="text-sm text-[#6b6455] mb-5">
          Podés seguir mirando la app, pero para crear, generar o publicar
          contenido real necesitás una suscripción activa.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg font-semibold text-[#2C2C2A] bg-[#EDE0C8]"
          >
            Volver
          </button>
          <a
            href="/suscripcion"
            className="flex-1 py-2 rounded-lg font-semibold text-white bg-[#C1502E] flex items-center justify-center"
          >
            Ir a Suscripción
          </a>
        </div>
      </div>
    </div>
  );
}
