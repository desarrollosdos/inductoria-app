import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import PageShell from '../components/PageShell';

// Mismos íconos que ya usan DashboardNav.jsx y Ayuda.jsx (duplicados acá
// porque esos componentes no los exportan).

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

// Switch tipo perilla (iOS). Verde oliva (mismo tono que "aprobado" en el
// resto de la app) cuando está activo, tan/neutro cuando está apagado.
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
        checked ? 'bg-[#7C8B6F]' : 'bg-[#D9CFB8]'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

const SECCIONES = [
  {
    id: 'procedimientos',
    campo: 'procedimientos_habilitado',
    label: 'Procedimientos',
    Icon: IconProcedimientos,
    texto:
      'Instructivos paso a paso generados a partir de tu contenido, para tareas puntuales (por ejemplo, cómo armar un pedido o resolver un reclamo). Si tu negocio no los usa, podés sacarlos del menú.',
  },
  {
    id: 'checklists',
    campo: 'checklists_habilitado',
    label: 'Checklists',
    Icon: IconChecklist,
    texto:
      'Tareas operativas que se repiten (apertura, cierre, limpieza, caja) y que tu equipo marca desde el celular. Si tu negocio no las usa, podés sacarlas del menú.',
  },
];

export default function Configuracion({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar() {
    setLoading(true);
    const { data } = await supabase
      .from('cuentas')
      .select('*')
      .eq('owner_id', session.user.id)
      .maybeSingle();
    setCuenta(data);
    setLoading(false);
  }

  async function handleToggle(campo) {
    const valorNuevo = !cuenta[campo];
    setGuardando(campo);
    const { error } = await supabase
      .from('cuentas')
      .update({ [campo]: valorNuevo })
      .eq('id', cuenta.id);
    setGuardando(null);
    if (error) {
      console.error(error);
      alert('No se pudo guardar el cambio. Probá de nuevo.');
      return;
    }
    setCuenta({ ...cuenta, [campo]: valorNuevo });
  }

  if (loading) {
    return <p className="text-center mt-24 text-[#6b6455]">Cargando...</p>;
  }

  if (!cuenta) {
    return (
      <div>
        <DashboardNav userEmail={session.user.email} />
        <div className="text-center mt-12 px-4">
          <p className="text-[#6b6455] mb-3">Primero cargá el nombre de tu negocio.</p>
          <a
            href="/sucursales"
            className="inline-block px-5 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
          >
            Ir a Sucursales
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <DashboardNav
        userEmail={session.user.email}
        flags={{
          procedimientos_habilitado: cuenta.procedimientos_habilitado,
          checklists_habilitado: cuenta.checklists_habilitado,
        }}
      />
      <PageShell>
        <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-2xl p-6">
          <h1 className="text-lg font-bold tracking-wide text-[#2C2C2A] mb-1">Configuración</h1>
          <p className="text-sm font-semibold tracking-wide text-[#2C2C2A]">
            Elegí qué funciones aparecen en tu menú. Vienen todas activadas; si tu negocio no usa
            alguna, la desactivás acá y desaparece del menú hasta que la vuelvas a activar.
          </p>
        </div>

        {SECCIONES.map(({ id, campo, label, Icon, texto }) => (
          <div
            key={id}
            className="bg-white rounded-2xl border border-[#EFDDCE] p-6 flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-[#EDE0C8] text-[#C1502E] flex items-center justify-center flex-shrink-0">
                <Icon />
              </div>
              <div>
                <h2 className="font-bold tracking-wide text-[#2C2C2A] mb-1">{label}</h2>
                <p className="text-sm text-[#3d382c]">{texto}</p>
              </div>
            </div>
            <Toggle
              checked={!!cuenta[campo]}
              onChange={() => handleToggle(campo)}
              disabled={guardando === campo}
            />
          </div>
        ))}

        <div className="flex justify-center">
          <a
            href="/"
            className="inline-block px-5 py-2 rounded-lg font-bold tracking-wide text-white bg-[#545C48]"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
          >
            Salir de Configuración
          </a>
        </div>
      </PageShell>
    </div>
  );
}
