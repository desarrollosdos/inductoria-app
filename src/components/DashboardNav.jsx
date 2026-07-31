const ADMIN_EMAIL = 'desarrollosdos@gmail.com';

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

function IconProgreso(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
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

function IconContenido(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 4h6l2 2h8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function IconAdmin(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

const TABS = [
  { id: 'suscripcion', label: 'Suscripción', path: '/', Icon: IconSuscripcion },
  { id: 'sucursales', label: 'Sucursales', path: '/sucursales', Icon: IconSucursales },
  { id: 'empleados', label: 'Empleados', path: '/empleados', Icon: IconEmpleados },
  { id: 'contenido', label: 'Contenido', path: '/contenido', Icon: IconContenido },
  { id: 'progreso', label: 'Progreso', path: '/progreso', Icon: IconProgreso },
];

export default function DashboardNav({ userEmail }) {
  const path = window.location.pathname;
  const isAdmin = userEmail === ADMIN_EMAIL;
  const tabs = isAdmin ? [...TABS, { id: 'admin', label: 'Admin', path: '/admin', Icon: IconAdmin }] : TABS;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-6">
      <div className="flex gap-3 overflow-x-auto sm:overflow-visible sm:flex-wrap sm:justify-center pb-2 -mx-1 px-1">
        {tabs.map((tab) => {
          const active = path === tab.path;
          const color = tab.id === 'admin' ? '#3F7D5C' : '#C1502E';
          return (
            <a
              key={tab.id}
              href={tab.path}
              className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl border flex-shrink-0 transition-colors"
              style={{ borderColor: active ? color : 'transparent', background: active ? '#fff' : 'transparent' }}
            >
              <span
                className="w-11 h-11 rounded-full flex items-center justify-center transition-colors"
                style={{ background: active ? color : '#EDE0C8', color: active ? '#fff' : '#8a8471' }}
              >
                <tab.Icon />
              </span>
              <span className={`text-xs font-semibold whitespace-nowrap ${active ? 'text-[#2C2C2A]' : 'text-[#8a8471]'}`}>
                {tab.label}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
