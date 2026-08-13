import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import PageShell from '../components/PageShell';
import { TIERS_PRECIO, precioPorSucursal } from '../lib/precio';

const VERDE = '#3F7D5C';

function etiquetaPlan(plan) {
  if (plan === 'active') return 'Activa';
  if (plan === 'inactive') return 'Inactiva';
  if (plan === 'past_due') return 'Pago pendiente';
  if (plan === 'suspended') return 'Suspendida';
  if (plan === 'cancelled') return 'Cancelada';
  return plan;
}

function formatUltimaConexion(fecha) {
  if (!fecha) return 'Nunca se conectó';
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24));
  const fechaTexto = new Date(fecha).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (dias <= 0) return `Hoy (${fechaTexto})`;
  if (dias === 1) return `Ayer (${fechaTexto})`;
  return `Hace ${dias} días (${fechaTexto})`;
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

function IconCostoIA(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2a5 5 0 0 1 5 5c0 1.5-.7 2.6-1.5 3.5-.6.7-1 1.3-1 2.5h-5c0-1.2-.4-1.8-1-2.5C7.7 9.6 7 8.5 7 7a5 5 0 0 1 5-5Z" />
      <path d="M9.5 17h5M10 20h4" />
    </svg>
  );
}

function IconVisitas(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconGaps(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.5.4.8.9.8 1.5V17h6.4v-.8c0-.6.3-1.1.8-1.5A7 7 0 0 0 12 2Z" />
    </svg>
  );
}

const SUB_TABS = [
  { id: 'resumen', label: 'Resumen', Icon: IconResumen },
  { id: 'clientes', label: 'Clientes e historial', Icon: IconClientes },
  { id: 'riesgos', label: 'Riesgos y análisis', Icon: IconRiesgos },
  { id: 'visitas', label: 'Visitas', Icon: IconVisitas },
  { id: 'gaps', label: 'Gaps de conocimiento', Icon: IconGaps },
  { id: 'costo', label: 'Costo de IA', Icon: IconCostoIA },
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

  const [costoIA, setCostoIA] = useState(null);
  const [cargandoCosto, setCargandoCosto] = useState(false);
  const [errorCosto, setErrorCosto] = useState(null);

  const [visitas, setVisitas] = useState(null);
  const [cargandoVisitas, setCargandoVisitas] = useState(false);
  const [errorVisitas, setErrorVisitas] = useState(null);

  const [precioBase, setPrecioBase] = useState(null);
  const [precioInput, setPrecioInput] = useState('');
  const [guardandoPrecio, setGuardandoPrecio] = useState(false);
  const [mensajePrecio, setMensajePrecio] = useState(null);

  useEffect(() => {
    cargarMetricas();
    cargarPrecio();
  }, []);

  useEffect(() => {
    if (tab === 'costo' && !costoIA) {
      cargarCostoIA();
    }
    if (tab === 'visitas' && !visitas) {
      cargarVisitas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function cargarVisitas() {
    setCargandoVisitas(true);
    setErrorVisitas(null);
    const { data, error } = await supabase.functions.invoke('admin-visitas', { method: 'GET' });
    setCargandoVisitas(false);

    if (error || data?.error) {
      setErrorVisitas(data?.error || 'No se pudieron cargar las visitas.');
      return;
    }
    setVisitas(data);
  }

  async function cargarPrecio() {
    const { data } = await supabase.from('configuracion_precio').select('precio_base').eq('id', 1).maybeSingle();
    if (data) {
      setPrecioBase(data.precio_base);
      setPrecioInput(String(data.precio_base));
    }
  }

  async function cargarCostoIA() {
    setCargandoCosto(true);
    setErrorCosto(null);
    const { data, error } = await supabase.functions.invoke('admin-costo-ia', { method: 'GET' });
    setCargandoCosto(false);

    if (error || data?.error) {
      setErrorCosto(data?.error || 'No se pudo cargar el costo de IA.');
      return;
    }
    setCostoIA(data);
  }

  async function handleGuardarPrecio(e) {
    e.preventDefault();
    setMensajePrecio(null);
    const valor = Number(precioInput);
    if (!valor || valor <= 0) {
      setMensajePrecio({ tipo: 'error', texto: 'Ingresá un precio válido.' });
      return;
    }

    setGuardandoPrecio(true);
    const { data, error } = await supabase.functions.invoke('actualizar-precio', {
      method: 'POST',
      body: { precio_base: valor },
    });
    setGuardandoPrecio(false);

    if (error || data?.error) {
      setMensajePrecio({ tipo: 'error', texto: data?.error || 'No se pudo actualizar el precio.' });
      return;
    }
    setPrecioBase(data.precio_base);
    setMensajePrecio({ tipo: 'ok', texto: 'Precio actualizado.' });
  }

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
                    <p className="text-xs text-[#8a8471] mt-1">
                      Última conexión: {formatUltimaConexion(c.ultimaConexion)}
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

        {tab === 'visitas' && (
          <>
            {cargandoVisitas ? (
              <p className="text-center text-[#6b6455] py-8">Cargando...</p>
            ) : errorVisitas ? (
              <p className="text-center text-[#C1502E] py-8">{errorVisitas}</p>
            ) : visitas ? (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <Tarjeta label="Hoy (total)" valor={visitas.total.hoy} />
                  <Tarjeta label="Este mes (total)" valor={visitas.total.mes} />
                  <Tarjeta label="Total histórico" valor={visitas.total.total} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-[#EFDDCE] p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-3">Landing</p>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#6b6455]">Hoy</span>
                      <span className="font-semibold text-[#2C2C2A]">{visitas.landing.hoy}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#6b6455]">Este mes</span>
                      <span className="font-semibold text-[#2C2C2A]">{visitas.landing.mes}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6b6455]">Total</span>
                      <span className="font-semibold text-[#2C2C2A]">{visitas.landing.total}</span>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-[#EFDDCE] p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-3">App</p>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#6b6455]">Hoy</span>
                      <span className="font-semibold text-[#2C2C2A]">{visitas.app.hoy}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#6b6455]">Este mes</span>
                      <span className="font-semibold text-[#2C2C2A]">{visitas.app.mes}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6b6455]">Total</span>
                      <span className="font-semibold text-[#2C2C2A]">{visitas.app.total}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
                  <h2 className="font-semibold text-[#2C2C2A] mb-4">Últimos 14 días</h2>
                  {visitas.porDia.length === 0 ? (
                    <p className="text-sm text-[#6b6455]">Todavía no hay visitas registradas.</p>
                  ) : (
                    <div className="space-y-2">
                      {visitas.porDia.map((d) => (
                        <div key={d.fecha} className="flex items-center justify-between border-b border-[#F5EFE3] pb-2 last:border-0">
                          <span className="text-sm text-[#2C2C2A]">
                            {new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                          <span className="text-xs text-[#8a8471]">
                            landing {d.landing} · app {d.app}
                          </span>
                          <span className="text-sm font-semibold text-[#C1502E]">{d.total}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </>
        )}

        {tab === 'gaps' && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-1">Gaps de conocimiento</h2>
            <p className="text-xs text-[#8a8471] mb-4">
              Cursos donde más se pregunta en el chat de dudas. Muchas preguntas repetidas sobre
              el mismo curso suelen ser señal de que algún paso no quedó claro.
            </p>
            {!datos.gapsConocimiento || datos.gapsConocimiento.length === 0 ? (
              <p className="text-sm text-[#6b6455]">Todavía no hay preguntas registradas.</p>
            ) : (
              <div className="space-y-3">
                {datos.gapsConocimiento.map((g) => (
                  <div key={g.microcurso_id} className="border border-[#F5EFE3] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-[#2C2C2A]">{g.titulo}</p>
                      <span className="text-xs font-semibold text-white bg-[#C1502E] rounded-full px-2.5 py-0.5 flex-shrink-0">
                        {g.total} pregunta{g.total === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-xs text-[#8a8471] mb-2">{g.cuenta}</p>
                    {g.ejemplos.length > 0 && (
                      <div className="space-y-1">
                        {g.ejemplos.map((ej, i) => (
                          <p key={i} className="text-xs text-[#6b6455] italic">
                            "{ej}"
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'costo' && (
          <>
            {cargandoCosto ? (
              <p className="text-center text-[#6b6455] py-8">Cargando...</p>
            ) : errorCosto ? (
              <p className="text-center text-[#C1502E] py-8">{errorCosto}</p>
            ) : costoIA ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Tarjeta label="Costo IA (mes actual)" valor={`US$ ${costoIA.totalUsdMes.toFixed(2)}`} />
                  <Tarjeta label="Costo IA (total)" valor={`US$ ${costoIA.totalUsd.toFixed(2)}`} />
                </div>
                <p className="text-xs text-[#8a8471]">
                  {costoIA.generaciones} curso{costoIA.generaciones === 1 ? '' : 's'} generado
                  {costoIA.generaciones === 1 ? '' : 's'} con IA en total, costo real según tokens
                  de Claude Haiku 4.5 (no estimado).
                </p>

                <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
                  <h2 className="font-semibold text-[#2C2C2A] mb-4">Costo por cuenta</h2>
                  {costoIA.porCuenta.length === 0 ? (
                    <p className="text-sm text-[#6b6455]">Todavía no se generó ningún curso con IA.</p>
                  ) : (
                    <div className="space-y-2">
                      {costoIA.porCuenta.map((c, i) => (
                        <div key={i} className="flex items-center justify-between border-b border-[#F5EFE3] pb-2 last:border-0">
                          <div>
                            <p className="text-sm font-semibold text-[#2C2C2A]">{c.nombre}</p>
                            <p className="text-xs text-[#8a8471]">
                              {c.generaciones} generación{c.generaciones === 1 ? '' : 'es'}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-[#C1502E]">US$ {c.usd.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </>
        )}

        {tab === 'precio' && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-1">Precio por cantidad de sucursales</h2>
            <p className="text-sm text-[#6b6455] mb-4">
              Cambiá el precio de 1 sucursal acá abajo. Los tramos por volumen (2-4, 5-9, 10+) se
              recalculan solos, guardando la misma proporción de descuento que tenían.
            </p>

            <form onSubmit={handleGuardarPrecio} className="flex items-end gap-2 mb-5">
              <div className="flex-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] block mb-1">
                  Precio 1 sucursal ($/mes)
                </label>
                <input
                  type="number"
                  min="1"
                  value={precioInput}
                  onChange={(e) => setPrecioInput(e.target.value)}
                  className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={guardandoPrecio}
                className="px-4 py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:opacity-60"
              >
                {guardandoPrecio ? 'Guardando...' : 'Guardar'}
              </button>
            </form>

            {mensajePrecio && (
              <p className={`text-xs mb-4 ${mensajePrecio.tipo === 'error' ? 'text-[#C1502E]' : 'text-[#1D9E75]'}`}>
                {mensajePrecio.texto}
              </p>
            )}

            <div className="space-y-2">
              {TIERS_PRECIO.map((t) => {
                const referencia = t.hasta === 1 ? 1 : t.hasta === 4 ? 2 : t.hasta === 9 ? 5 : 10;
                const precioTramo = precioPorSucursal(referencia, precioBase || 12000);
                return (
                  <div key={t.etiqueta} className="flex justify-between border-b border-[#F5EFE3] pb-2 last:border-0">
                    <span className="text-sm text-[#2C2C2A]">{t.etiqueta}</span>
                    <span className="text-sm font-semibold text-[#C1502E]">
                      ${precioTramo.toLocaleString('es-AR')} c/u
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PageShell>
    </div>
  );
}
