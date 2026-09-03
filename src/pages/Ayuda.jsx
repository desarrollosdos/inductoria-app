import DashboardNav from '../components/DashboardNav';
import PageShell from '../components/PageShell';

// Mismos íconos que usa DashboardNav.jsx (duplicados acá porque esos
// componentes no están exportados desde ese archivo). Un ícono nuevo,
// IconAyuda, para el signo de pregunta del botón en Suscripción.

function IconSucursales(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

function IconEmpleados(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <circle cx="17.5" cy="8.5" r="2.4" />
      <path d="M15.5 14.3c2.6.3 4.5 2.5 4.5 5.2" />
    </svg>
  );
}

function IconContenido(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 4h6l2 2h8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function IconProcedimientos(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" />
      <path d="M13 3v4.5A1.5 1.5 0 0 0 14.5 9H19" />
      <line x1="8.5" y1="13" x2="15.5" y2="13" />
      <line x1="8.5" y1="17" x2="15.5" y2="17" />
    </svg>
  );
}

function IconChecklist(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 3h6l1 2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3l1-2z" />
      <path d="m8 11 1.3 1.3L12 9.8" />
      <path d="m8 16 1.3 1.3L12 14.8" />
    </svg>
  );
}

function IconProgreso(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 14.2 6.5 21l5.5-3 5.5 3-2-6.8" />
    </svg>
  );
}

function IconSuscripcion(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function IconConfiguracion(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3 13.09H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const SECCIONES = [
  {
    id: 'suscripcion',
    label: 'Suscripción',
    path: '/',
    Icon: IconSuscripcion,
    texto:
      'Es la pantalla de inicio. Acá ves el estado de tu plan (prueba gratis, activa, pago pendiente, etc.) y el precio según cuántas sucursales tenés. Desde acá te suscribís cuando termina la prueba gratis y también podés cancelar la suscripción si hace falta.',
  },
  {
    id: 'sucursales',
    label: 'Sucursales',
    path: '/sucursales',
    Icon: IconSucursales,
    texto:
      'Cargá el nombre de tu negocio y la dirección de cada sucursal (localidad, código postal, teléfono, mail). Acá también agregás sucursales nuevas cuando tu negocio crece: la que agregues se suma a tu plan a partir del próximo cobro.',
  },
  {
    id: 'empleados',
    label: 'Empleados',
    path: '/empleados',
    Icon: IconEmpleados,
    texto:
      'Das de alta a tu equipo: nombre, puesto y sucursal. Cada empleado no necesita usuario ni contraseña propia. Accede con un link y un PIN de 4 dígitos, que encontrás en Progreso. Si alguien deja de trabajar con vos, lo das de baja desde acá.',
  },
  {
    id: 'contenido',
    label: 'Contenido',
    path: '/contenido',
    Icon: IconContenido,
    texto:
      'Subís el material de capacitación que ya tenés: manuales en PDF o Word, apuntes de texto, fotos de carteles o instructivos, notas de voz grabadas ahí mismo o audios ya grabados. Lo aprobás y la IA arma un curso corto con pasos y una evaluación. Después lo revisás, elegís a qué puesto le aplica y lo publicás.',
  },
  {
    id: 'procedimientos',
    label: 'Procedimientos',
    path: '/procedimientos',
    Icon: IconProcedimientos,
    texto:
      'A partir del mismo contenido que ya aprobaste en la biblioteca, generás procedimientos (instructivos paso a paso): objetivo, qué necesitás a mano, pasos numerados y qué hacer ante excepciones. Los revisás, aprobás y podés descargarlos en PDF para imprimir o compartir con tu equipo.',
  },
  {
    id: 'checklists',
    label: 'Checklists',
    path: '/checklists',
    Icon: IconChecklist,
    texto:
      'Es para tareas operativas que se repiten, como apertura, cierre, limpieza o caja. Armás un checklist, elegís si es diario, semanal o mensual y a qué puesto le aplica (por ejemplo, que "Cierre de caja" solo lo vea el cajero). Tu equipo lo completa desde el celular con el mismo link de siempre y vos ves el historial y quién cumple.',
  },
  {
    id: 'progreso',
    label: 'Progreso',
    path: '/progreso',
    Icon: IconProgreso,
    texto:
      'Es el panel de seguimiento de tu equipo: ranking, qué cursos completó cada uno, certificados descargables y si confirmaron el acuse de recibido de Seguridad e Higiene. Desde acá también conseguís el link, el PIN y el código QR de acceso de cada empleado.',
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    path: '/configuracion',
    Icon: IconConfiguracion,
    texto:
      'Se accede con el ícono de engranaje al lado de tu mail, arriba a la derecha (no está en este menú). Ahí elegís qué funciones aparecen para tu equipo: si tu negocio no usa Procedimientos o Checklists, los podés sacar del menú y volver a activarlos cuando quieras.',
  },
];

export default function Ayuda({ session }) {
  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <PageShell>
        <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-2xl p-6">
          <h1 className="text-lg font-bold tracking-wide text-[#2C2C2A] mb-1">¿Cómo se usa Inductoria?</h1>
          <p className="text-sm font-semibold tracking-wide text-[#2C2C2A]">
            Una guía rápida de qué encontrás en cada sección del menú y para qué sirve.
          </p>
        </div>

        {SECCIONES.map(({ id, label, path, Icon, texto }) => (
          <div key={id} className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <a href={path} className="flex items-center gap-3 mb-2 w-fit">
              <div className="w-9 h-9 rounded-full bg-[#EDE0C8] text-[#C1502E] flex items-center justify-center flex-shrink-0">
                <Icon />
              </div>
              <h2 className="font-bold tracking-wide text-[#C1502E]">{label}</h2>
            </a>
            <p className="text-sm text-[#3d382c]">{texto}</p>
          </div>
        ))}
      </PageShell>
    </div>
  );
}
