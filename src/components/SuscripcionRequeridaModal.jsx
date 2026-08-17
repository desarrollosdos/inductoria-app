// Modal compartido: se muestra cuando el dueño intenta usar una función
// real (crear, generar, publicar) sin tener una suscripción activa
// (ni active ni past_due ni trial vigente). Mismo criterio de mensaje
// que el cartel de bloqueo de Repunte.
//
// variante='ia': caso especial de una cuenta EN TRIAL que apretó una
// función de IA (generar/actualizar curso, generar procedimiento, leer
// una imagen). Ahí el resto de la app sí funciona, así que el mensaje
// aclara eso en vez de sonar a "no podés usar nada".
const COPY = {
  general: {
    titulo: 'Activá tu suscripción para seguir usando Inductoria',
    texto: 'Podés seguir mirando la app, pero para crear, generar o publicar contenido real necesitás una suscripción activa.',
  },
  ia: {
    titulo: 'Suscribite para usar las funciones con IA',
    texto: 'Generar o actualizar cursos, generar procedimientos, o leer imágenes con inteligencia artificial son funciones pagas. Podés seguir usando el resto de Inductoria (empleados, biblioteca de cursos, progreso) durante tu prueba gratis.',
  },
};

export default function SuscripcionRequeridaModal({ onClose, variante = 'general' }) {
  const copy = COPY[variante] || COPY.general;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-sm w-full border border-[#EFDDCE] text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-bold text-[#2C2C2A] mb-2">{copy.titulo}</p>
        <p className="text-sm text-[#6b6455] mb-5">{copy.texto}</p>
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
