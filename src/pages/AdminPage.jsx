import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import PageShell from '../components/PageShell';

const VERDE = '#3F7D5C';

function etiquetaPlan(plan) {
  if (plan === 'active') return 'Activa';
  if (plan === 'inactive') return 'Inactiva';
  if (plan === 'past_due') return 'Pago pendiente';
  if (plan === 'suspended') return 'Suspendida';
  if (plan === 'cancelled') return 'Cancelada';
  return plan;
}

function IconAlerta(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconResumen(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

function IconClientes(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <circle cx="17.5" cy="8.5" r="2.4" />
      <path d="M15.5 14.3c2.6.3 4.5 2.5 4.5 5.2" />
    </svg>
  );
}

function IconRiesgos(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconPrecio(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

const SUB_TABS = [
  { id: 'resumen', label: 'Resumen', Icon: IconResumen },
  { id: 'clientes', label: 'Clientes e historial', Icon: IconClientes },
  { id: 'riesgos', label: 'Riesgos y análisis', Icon: IconRiesgos },
  { id: 'precio', label: 'Precio', Icon: IconPrecio },
];

function Tarjeta({ label, valor }) {
  return (
    <div className="bg-white rounded-2xl border border-[#EFDDCE] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-1">{label}</p>
      <p className="text-3xl font-bold text-[#2C2C2A]">{valor}</p>
    </div>
  );
}

export default function AdminPage({ session }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('resumen');

  useEffect(() => {
    cargarMetricas();
  }, []);

  async function cargarMetricas() {
    setCargando(true);
    setError(null);

    const { data, error } = await supabase.functions.invoke('admin-metrics', { method: 'GET' });

    setCargando(false);

    if (error) {
      setError('No se pudieron cargar las métricas.');
      return;
    }
    setDatos(data);
  }

  if (cargando) {
    return <p className="text-center mt-24 text-[#6b6455]">Cargando...</p>;
  }

  if (error) {
    return <p className="text-center mt-24 text-[#C1502E]">{error}</p>;
  }

  if (!datos) {
    return <p className="text-center mt-24 text-[#6b6455]">No se pudieron cargar las métricas.</p>;
  }

  const { resumen, clientes, riesgos } = datos;
  const cuentasActivas = clientes.filter((c) => c.plan === 'active').length;

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <PageShell>
        <div className="bg-[#EDE0C8] rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#2C2C2A] flex items-center justify-center flex-shrink-0">
              <IconAlerta className="text-white" />
            </div>
            <span className="text-[15px] font-semibold text-[#2C2C2A]">Panel de administración</span>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white text-[#2C2C2A]">
            {cuentasActivas} activas
          </span>
        </div>

        <p className="text-xs text-[#8a8471] -mt-2">
          Las métricas de acá reflejan los datos cargados, no una conciliación con MercadoPago.
        </p>

        {/* Subsecciones, mismo patrón que el nav principal, en verde */}
        <div className="flex justify-between sm:justify-start sm:gap-4">
          {SUB_TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex-1 sm:flex-none flex flex-col items-center gap-1.5 text-center"
              >
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: active ? VERDE : '#EDE0C8', color: active ? '#fff' : '#8a8471' }}
                >
                  <t.Icon />
                </span>
                <span
                  className={`text-[9.5px] sm:text-xs font-semibold whitespace-nowrap ${
                    active ? 'text-[#2C2C2A]' : 'text-[#8a8471]'
                  }`}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>

        {tab === 'resumen' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Tarjeta label="Cuentas" valor={resumen.totalCuentas} />
              <Tarjeta label="Sucursales" valor={resumen.totalNegocios} />
              <Tarjeta label="Empleados activos" valor={resumen.totalEmpleadosActivos} />
              <Tarjeta label="Cursos" valor={resumen.totalMicrocursos} />
            </div>

            <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
              <h2 className="font-semibold text-[#2C2C2A] mb-4">Cuentas por plan</h2>
              <div className="flex gap-6 flex-wrap">
                {Object.entries(resumen.planCounts).length === 0 && (
                  <p className="text-sm text-[#6b6455]">Todavía no hay cuentas cargadas.</p>
                )}
                {Object.entries(resumen.planCounts).map(([plan, cantidad]) => (
                  <div key={plan}>
                    <p className="text-2xl font-bold text-[#2C2C2A]">{cantidad}</p>
                    <p className="text-xs text-[#8a8471] uppercase tracking-wide">{etiquetaPlan(plan)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
              <h2 className="font-semibold text-[#2C2C2A] mb-4">Últimas cuentas creadas</h2>
              {resumen.ultimasCuentas.length === 0 ? (
                <p className="text-sm text-[#6b6455]">Todavía no hay cuentas cargadas.</p>
              ) : (
                <div className="space-y-2">
                  {resumen.ultimasCuentas.map((c) => (
                    <div key={c.id} className="flex items-center justify-between border-b border-[#F5EFE3] pb-2 last:border-0">
                      <div>
                        <p className="text-sm font-semibold text-[#2C2C2A]">{c.nombre}</p>
                        <p className="text-xs text-[#8a8471]">{new Date(c.created_at).toLocaleDateString('es-AR')}</p>
                      </div>
                      <span className="text-xs font-semibold uppercase text-[#C1502E]">{etiquetaPlan(c.plan)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'clientes' && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-4">Todas las cuentas ({clientes.length})</h2>
            {clientes.length === 0 ? (
              <p className="text-sm text-[#6b6455]">Todavía no hay cuentas cargadas.</p>
            ) : (
              <div className="space-y-3">
                {clientes.map((c) => (
                  <div key={c.id} className="border border-[#F5EFE3] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-[#2C2C2A]">{c.nombre}</p>
                      <span className="text-xs font-semibold uppercase text-[#C1502E]">{etiquetaPlan(c.plan)}</span>
                    </div>
                    <p className="text-xs text-[#8a8471]">
                      {c.sucursales}/{c.sucursalesContratadas} sucursales · {c.empleados} empleados · alta{' '}
                      {new Date(c.created_at).toLocaleDateString('es-AR')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'riesgos' && (
          <>
            <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
              <h2 className="font-semibold text-[#2C2C2A] mb-3">
                Pago en riesgo ({riesgos.pagoEnRiesgo.length})
              </h2>
              {riesgos.pagoEnRiesgo.length === 0 ? (
                <p className="text-sm text-[#6b6455]">Ninguna cuenta con problemas de pago.</p>
              ) : (
                <div className="space-y-2">
                  {riesgos.pagoEnRiesgo.map((c) => (
                    <div key={c.id} className="flex items-center justify-between border-b border-[#F5EFE3] pb-2 last:border-0">
                      <p className="text-sm font-semibold text-[#2C2C2A]">{c.nombre}</p>
                      <span className="text-xs font-semibold uppercase text-[#C1502E]">{etiquetaPlan(c.plan)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
              <h2 className="font-semibold text-[#2C2C2A] mb-3">
                Sin empleados cargados ({riesgos.sinEmpleados.length})
              </h2>
              {riesgos.sinEmpleados.length === 0 ? (
                <p className="text-sm text-[#6b6455]">Todas las cuentas ya cargaron al menos un empleado.</p>
              ) : (
                <div className="space-y-2">
                  {riesgos.sinEmpleados.map((c) => (
                    <p key={c.id} className="text-sm text-[#2C2C2A]">
                      {c.nombre}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
              <h2 className="font-semibold text-[#2C2C2A] mb-3">
                Al límite de su cupo de sucursales ({riesgos.cupoLleno.length})
              </h2>
              {riesgos.cupoLleno.length === 0 ? (
                <p className="text-sm text-[#6b6455]">Ninguna cuenta llegó a su límite todavía.</p>
              ) : (
                <div className="space-y-2">
                  {riesgos.cupoLleno.map((c) => (
                    <p key={c.id} className="text-sm text-[#2C2C2A]">
                      {c.nombre} ({c.sucursales}/{c.sucursalesContratadas})
                    </p>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'precio' && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-1">Precio por cantidad de sucursales</h2>
            <p className="text-sm text-[#6b6455] mb-4">
              De referencia por ahora, no editable desde acá (no es un precio único como en Repunte).
            </p>
            <div className="space-y-2">
              <div className="flex justify-between border-b border-[#F5EFE3] pb-2">
                <span className="text-sm text-[#2C2C2A]">1 sucursal</span>
                <span className="text-sm font-semibold text-[#C1502E]">$12.000/mes</span>
              </div>
              <div className="flex justify-between border-b border-[#F5EFE3] pb-2">
                <span className="text-sm text-[#2C2C2A]">2 a 4 sucursales</span>
                <span className="text-sm font-semibold text-[#C1502E]">$10.000 c/u</span>
              </div>
              <div className="flex justify-between border-b border-[#F5EFE3] pb-2">
                <span className="text-sm text-[#2C2C2A]">5 a 9 sucursales</span>
                <span className="text-sm font-semibold text-[#C1502E]">$9.000 c/u</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-[#2C2C2A]">10 o más sucursales</span>
                <span className="text-sm font-semibold text-[#C1502E]">$8.000 c/u</span>
              </div>
            </div>
          </div>
        )}
      </PageShell>
    </div>
  );
}
