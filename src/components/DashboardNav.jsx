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

function IconContenido(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 4h6l2 2h8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

// Antes era el mismo cuerpo de "portapapeles" que Checklist, solo con un
// tilde adentro en vez de dos filas de tildes: a 36px (tamaño real en esta
// barra) los dos se veían casi iguales. Ahora es una hoja con la esquina
// doblada arriba y líneas de texto: silueta bien distinta, y además se lee
// como "documento" en vez de "lista que se marca", que es justo lo que es
// un procedimiento (un instructivo, no una tarea diaria).
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

// Ya no hay lógica de admin acá: antes esta barra le agregaba a
// desarrollosdos@gmail.com una pestaña extra "Admin" además de las de
// siempre. Ahora que Admin pasó a ser una sección aparte que reemplaza
// toda la app para ese mail (ver App.jsx, que decide con
// supabase.rpc('es_administrador')), esta barra volvió a ser simple: las
// mismas pestañas para todo el mundo, sin comparar mails acá.
//
// "Checklists" queda siempre visible (no se oculta según la cuenta):
// es una función opcional que cualquiera puede activar, y que se vea acá
// es justamente lo que la hace descubrible. Si la cuenta no la activó
// todavía, la propia página de Checklists.jsx muestra el cartel para
// activarla en vez de escondérsela.
const TABS = [
  { id: 'suscripcion', label: 'Suscripción', path: '/', Icon: IconSuscripcion },
  { id: 'sucursales', label: 'Sucursales', path: '/sucursales', Icon: IconSucursales },
  { id: 'empleados', label: 'Empleados', path: '/empleados', Icon: IconEmpleados },
  { id: 'contenido', label: 'Contenido', path: '/contenido', Icon: IconContenido },
  { id: 'procedimientos', label: 'Procedimientos', path: '/procedimientos', Icon: IconProcedimientos },
  { id: 'checklists', label: 'Checklists', path: '/checklists', Icon: IconChecklist },
  { id: 'progreso', label: 'Progreso', path: '/progreso', Icon: IconProgreso },
];

export default function DashboardNav() {
  const path = window.location.pathname;

  return (
    <nav className="max-w-4xl mx-auto mt-4 px-4">
      {/* Con 7 pestañas ahora (se sumó Checklists), cada columna en mobile
          quedaba bastante angosta. Antes el texto tenía whitespace-nowrap
          y sin gap entre columnas, así que una etiqueta larga como
          "Suscripción" se salía de su propia columna y quedaba pegada a
          la de al lado. Con un gap chico entre columnas y dejando que el
          texto pueda partirse en 2 líneas en mobile (nowrap solo desde
          sm: en adelante, donde ya hay más aire), cada etiqueta se queda
          dentro de su propio espacio en vez de invadir el vecino. */}
      <div className="flex justify-between gap-1 sm:justify-start sm:gap-4">
        {TABS.map((tab) => {
          const active = path === tab.path;
          return (
            <a
              key={tab.id}
              href={tab.path}
              className="flex-1 sm:flex-none flex flex-col items-center gap-2.5 text-center"
            >
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                style={{ background: active ? '#C1502E' : '#EDE0C8', color: active ? '#fff' : '#8a8471' }}
              >
                <tab.Icon />
              </span>
              <span
                className={`text-[9.5px] sm:text-xs font-semibold leading-tight sm:whitespace-nowrap ${
                  active ? 'text-[#2C2C2A]' : 'text-[#8a8471]'
                }`}
              >
                {tab.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
