import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
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

// Misma lámpara que el botón "¿Cómo se usa Inductoria?" en Suscripcion.jsx
// (copiada de ahí tal cual, para que sea el mismo ícono en los dos
// lugares). Usada en la franja EstadoBar de esta pantalla, 2026-09-07.
function IconAyuda(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.7V17h6v-1.5c0-.7.3-1.3.8-1.7A6.5 6.5 0 0 0 12 2z" />
      <path d="M9 19h6" fill="none" />
      <path d="M10 21.5h4" fill="none" />
    </svg>
  );
}

// Textos revisados contra lo que hace la app de verdad (lib/acceso.js,
// Dashboard.jsx, Empleados.jsx, etc.). Si cambia una regla (días de
// prueba, topes, qué pide suscripción), hay que actualizarlo acá también.
const SECCIONES = [
  {
    id: 'suscripcion',
    label: 'Suscripción',
    path: '/',
    Icon: IconSuscripcion,
    texto:
      'Es la pantalla de inicio. Acá ves cómo está tu plan (prueba gratis, activo, pago pendiente) y cuánto pagás según tus sucursales. Desde acá te suscribís y, si hace falta, cancelás. La prueba gratis dura 7 días: podés cargar 1 sucursal y hasta 20 empleados por sucursal, pero no podés armar cursos ni procedimientos con IA, leer fotos de carteles ni usar el chat de dudas de los empleados. Todo eso se habilita cuando te suscribís.',
  },
  {
    id: 'sucursales',
    label: 'Sucursales',
    path: '/sucursales',
    Icon: IconSucursales,
    texto:
      'Cargás los datos de cada sucursal: dirección, localidad, teléfono y mail. Podés cargar tantas como tenga tu plan. Si ya estás suscripto y necesitás una más, la sumás desde acá y se agrega a tu plan desde el próximo cobro.',
  },
  {
    id: 'empleados',
    label: 'Empleados',
    path: '/empleados',
    Icon: IconEmpleados,
    texto:
      'Sumás a tu equipo con nombre, puesto, sucursal y teléfono. Nadie necesita usuario ni contraseña: cada uno entra con un link y un PIN de 4 números. Con el botón verde de la llave ves su link y su PIN, se los copiás o mandás por WhatsApp y, si lo perdió, le generás un PIN nuevo. Si alguien deja de trabajar con vos, lo das de baja desde acá.',
  },
  {
    id: 'contenido',
    label: 'Contenido',
    path: '/contenido',
    Icon: IconContenido,
    texto:
      'Subís lo que ya usás para explicar: manuales en PDF o Word, texto, fotos de carteles o instructivos, o notas de voz (las grabás ahí mismo o subís un audio). Video no se puede. Lo marcás como aprobado, la IA arma un curso corto con una evaluación, lo revisás, lo publicás y elegís a qué puestos le toca. También tenés cursos ya armados para sumar, como el de seguridad e higiene.',
  },
  {
    id: 'procedimientos',
    label: 'Procedimientos',
    path: '/procedimientos',
    Icon: IconProcedimientos,
    texto:
      'Con el mismo contenido que ya aprobaste, la IA arma instructivos paso a paso: para qué sirve, qué necesitás a mano, los pasos en orden y qué hacer si algo sale mal. Los revisás, los aprobás y los bajás en PDF para imprimir.',
  },
  {
    id: 'checklists',
    label: 'Checklists',
    path: '/checklists',
    Icon: IconChecklist,
    texto:
      'Para tareas que se repiten, como apertura, cierre, limpieza o caja. Armás la lista, elegís si es diaria, semanal o mensual y a qué puestos le toca (por ejemplo, que "Cierre de caja" solo lo vea el cajero). Tu equipo la marca desde el celular, con el mismo link de los cursos. Vos ves quién la completó y cada cuánto se cumple.',
  },
  {
    id: 'progreso',
    label: 'Progreso',
    path: '/progreso',
    Icon: IconProgreso,
    texto:
      'Acá seguís a tu equipo: quién arrancó, quién va más adelantado, qué cursos completó cada uno, los certificados para descargar y si confirmaron que recibieron el curso de seguridad e higiene. A quien todavía tiene cursos pendientes le podés mandar el link por WhatsApp o mostrarle el código QR.',
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    path: '/configuracion',
    Icon: IconConfiguracion,
    texto:
      'Entrás con el engranaje de arriba a la derecha, al lado de tu mail (no está en este menú). Ahí elegís qué secciones usás: si tu negocio no usa Procedimientos o Checklists, los apagás, salen del menú y quedan desactivados hasta que los vuelvas a prender.',
  },
];

export default function Ayuda({ session }) {
  // Empieza con "suscripcion" marcado (primera sección) y va cambiando
  // a medida que cada tarjeta cruza una franja angosta cerca del tope de
  // la pantalla, para que se sienta como "voy leyendo y se va marcando",
  // no como que salta recién cuando la tarjeta está totalmente arriba.
  const [activo, setActivo] = useState(SECCIONES[0].id);
  const refsSecciones = useRef({});

  // Flags de la cuenta (procedimientos_habilitado / checklists_habilitado),
  // solo para que el menú de arriba (DashboardNav) sepa qué pestañas
  // mostrar acá también: si el dueño las desactivó en Configuración, no
  // deben aparecer en este menú, igual que en el resto de las pantallas
  // (2026-09-07, a pedido de Roberto).
  const [cuenta, setCuenta] = useState(null);

  useEffect(() => {
    let vigente = true;
    async function cargarCuenta() {
      const { data } = await supabase
        .from('cuentas')
        .select('procedimientos_habilitado, checklists_habilitado')
        .eq('owner_id', session.user.id)
        .maybeSingle();
      if (vigente) setCuenta(data);
    }
    cargarCuenta();
    return () => {
      vigente = false;
    };
  }, [session.user.id]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActivo(entry.target.dataset.seccionId);
          }
        });
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 }
    );

    Object.values(refsSecciones.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div>
      <DashboardNav
        userEmail={session.user.email}
        flags={
          cuenta
            ? {
                procedimientos_habilitado: cuenta.procedimientos_habilitado,
                checklists_habilitado: cuenta.checklists_habilitado,
              }
            : undefined
        }
        seccionActiva={activo}
      />
      <PageShell>
        <EstadoBar icon={IconAyuda} label="¿Cómo se usa Inductoria?" />

        <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-2xl p-6">
          <p className="text-sm font-semibold tracking-wide text-[#2C2C2A]">
            Qué hay en cada sección del menú y para qué sirve.
          </p>
        </div>

        {SECCIONES.map(({ id, label, path, Icon, texto }) => (
          <div
            key={id}
            ref={(el) => (refsSecciones.current[id] = el)}
            data-seccion-id={id}
            className="bg-white rounded-2xl border border-[#EFDDCE] p-6"
          >
            <a href={path} className="flex items-center gap-3 mb-2 w-fit min-h-[40px]">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                  activo === id ? 'bg-[#C1502E] text-white' : 'bg-[#EDE0C8] text-[#C1502E]'
                }`}
              >
                <Icon />
              </div>
              <h2 className="font-bold tracking-wide text-[#C1502E]">{label}</h2>
            </a>
            <p
              className={`text-sm text-[#3d382c] transition-all ${
                activo === id ? 'font-semibold tracking-wide' : 'font-normal'
              }`}
            >
              {texto}
            </p>
          </div>
        ))}

        <div className="flex justify-center">
          <a
            href="/"
            className="inline-block px-5 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
          >
            Salir de Ayuda
          </a>
        </div>

        {/* Sin esto, la última tarjeta (Configuración) nunca llega a cruzar
            la franja de detección: al no haber más contenido debajo, el
            scroll se termina antes de que su parte de arriba suba lo
            suficiente. Este espacio en blanco le da lugar de sobra para
            "subir" hasta la franja aunque sea la última sección. */}
        <div className="h-[60vh]" aria-hidden="true" />
      </PageShell>
    </div>
  );
}
