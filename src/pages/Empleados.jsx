import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';

function IconEmpleadosMini(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <circle cx="17.5" cy="8.5" r="2.4" />
      <path d="M15.5 14.3c2.6.3 4.5 2.5 4.5 5.2" />
    </svg>
  );
}

export default function Empleados({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState('alfabetico'); // 'alfabetico' | 'sucursal'

  const [negocioSeleccionado, setNegocioSeleccionado] = useState('');
  const [nombreEmpleado, setNombreEmpleado] = useState('');
  const [puesto, setPuesto] = useState('');
  const [telefonoEmpleado, setTelefonoEmpleado] = useState('');
  const [mailEmpleado, setMailEmpleado] = useState('');
  const [creando, setCreando] = useState(false);
  const [ultimoLink, setUltimoLink] = useState(null);

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarTodo() {
    setLoading(true);

    const { data: cuentaData } = await supabase
      .from('cuentas')
      .select('*')
      .eq('owner_id', session.user.id)
      .maybeSingle();
    setCuenta(cuentaData);

    if (cuentaData) {
      const { data: negociosData } = await supabase
        .from('negocios')
        .select('*')
        .eq('cuenta_id', cuentaData.id)
        .order('nombre', { ascending: true });
      setNegocios(negociosData || []);

      const negocioIds = (negociosData || []).map((n) => n.id);
      if (negocioIds.length > 0) {
        const { data: empleadosData } = await supabase
          .from('empleados')
          .select('*')
          .in('negocio_id', negocioIds)
          .order('nombre', { ascending: true });
        setEmpleados(empleadosData || []);
      }
    }

    setLoading(false);
  }

  async function handleCrearEmpleado(e) {
    e.preventDefault();
    if (!nombreEmpleado.trim() || !negocioSeleccionado) return;
    setCreando(true);
    setUltimoLink(null);

    const { data, error } = await supabase
      .from('empleados')
      .insert({
        negocio_id: negocioSeleccionado,
        nombre: nombreEmpleado.trim(),
        puesto: puesto.trim() || null,
        telefono: telefonoEmpleado.trim() || null,
        mail: mailEmpleado.trim() || null,
      })
      .select()
      .single();

    setCreando(false);
    if (error) {
      console.error(error);
      return;
    }

    const link = `${window.location.origin}/empleado?token=${data.token_acceso}`;
    setUltimoLink(link);
    setNombreEmpleado('');
    setPuesto('');
    setTelefonoEmpleado('');
    setMailEmpleado('');
    setEmpleados([...empleados, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
  }

  async function handleBaja(empleadoId) {
    const { error } = await supabase
      .from('empleados')
      .update({ fecha_baja: new Date().toISOString() })
      .eq('id', empleadoId);
    if (error) {
      console.error(error);
      return;
    }
    setEmpleados(
      empleados.map((e) => (e.id === empleadoId ? { ...e, fecha_baja: new Date().toISOString() } : e))
    );
  }

  function nombreNegocio(negocioId) {
    return negocios.find((n) => n.id === negocioId)?.nombre || '—';
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
          <a href="/sucursales" className="inline-block px-5 py-2 rounded-lg font-semibold text-white bg-[#C1502E]">
            Ir a Sucursales
          </a>
        </div>
      </div>
    );
  }

  const activos = empleados.filter((e) => !e.fecha_baja);
  const dadosDeBaja = empleados.filter((e) => e.fecha_baja);

  function FilaEmpleado({ e }) {
    return (
      <div className="flex items-center justify-between border-b border-[#F5EFE3] pb-2 last:border-0">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[#2C2C2A]">{e.nombre}</p>
            {e.puesto && (
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#F5EFE3] text-[#C1502E] px-2 py-0.5 rounded-full">
                {e.puesto}
              </span>
            )}
          </div>
          <p className="text-xs text-[#8a8471]">
            {nombreNegocio(e.negocio_id)} · alta {new Date(e.fecha_alta).toLocaleDateString('es-AR')}
          </p>
        </div>
        <button onClick={() => handleBaja(e.id)} className="text-xs font-semibold text-[#C1502E] hover:underline">
          Dar de baja
        </button>
      </div>
    );
  }

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <EstadoBar
        session={session}
        icon={IconEmpleadosMini}
        label="Empleados"
        right={<span className="text-sm font-bold text-[#C1502E]">{empleados.length}</span>}
      />
      <div className="max-w-4xl mx-auto mt-4 px-4 pb-16 space-y-6">
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h2 className="font-semibold text-[#2C2C2A] mb-3">Dar de alta un empleado</h2>

          {negocios.length === 0 ? (
            <p className="text-sm text-[#6b6455]">
              Primero cargá al menos una sucursal, en la pantalla de Sucursales.
            </p>
          ) : (
            <form onSubmit={handleCrearEmpleado} className="space-y-2">
              <select
                value={negocioSeleccionado}
                onChange={(e) => setNegocioSeleccionado(e.target.value)}
                required
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="">Elegí la sucursal</option>
                {negocios.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nombre}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                value={nombreEmpleado}
                onChange={(e) => setNombreEmpleado(e.target.value)}
                placeholder="Nombre del empleado"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <input
                type="text"
                required
                value={puesto}
                onChange={(e) => setPuesto(e.target.value)}
                placeholder="Puesto (ej: cajera, vendedora, mesera)"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <input
                type="tel"
                value={telefonoEmpleado}
                onChange={(e) => setTelefonoEmpleado(e.target.value)}
                placeholder="Teléfono"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <input
                type="email"
                value={mailEmpleado}
                onChange={(e) => setMailEmpleado(e.target.value)}
                placeholder="Mail"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={creando || !negocioSeleccionado || !nombreEmpleado.trim() || !puesto.trim()}
                className="w-full py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:bg-[#EFDDCE] disabled:text-[#8a8471]"
              >
                {creando ? 'Creando...' : 'Dar de alta'}
              </button>
            </form>
          )}

          {ultimoLink && (
            <div className="mt-4 bg-[#F5EFE3] border border-[#EFDDCE] rounded-lg p-3 text-sm">
              <p className="text-[#2C2C2A] mb-1 font-semibold">Mandale este link al empleado:</p>
              <p className="text-[#3d382c] break-all">{ultimoLink}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[#2C2C2A]">Empleados activos ({activos.length})</h2>
            <div className="flex gap-1 bg-[#F5EFE3] rounded-lg p-1">
              <button
                onClick={() => setVista('alfabetico')}
                className={`text-xs font-semibold px-3 py-1 rounded-md ${
                  vista === 'alfabetico' ? 'bg-white text-[#2C2C2A]' : 'text-[#8a8471]'
                }`}
              >
                A-Z
              </button>
              <button
                onClick={() => setVista('sucursal')}
                className={`text-xs font-semibold px-3 py-1 rounded-md ${
                  vista === 'sucursal' ? 'bg-white text-[#2C2C2A]' : 'text-[#8a8471]'
                }`}
              >
                Por sucursal
              </button>
            </div>
          </div>

          {activos.length === 0 ? (
            <p className="text-sm text-[#6b6455]">Todavía no diste de alta a nadie.</p>
          ) : vista === 'alfabetico' ? (
            <div className="space-y-2">
              {activos.map((e) => (
                <FilaEmpleado key={e.id} e={e} />
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {negocios.map((n) => {
                const deEstaSucursal = activos.filter((e) => e.negocio_id === n.id);
                if (deEstaSucursal.length === 0) return null;
                return (
                  <div key={n.id}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-2">
                      {n.nombre}
                    </p>
                    <div className="space-y-2">
                      {deEstaSucursal.map((e) => (
                        <FilaEmpleado key={e.id} e={e} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {dadosDeBaja.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#8a8471] mb-3">Dados de baja ({dadosDeBaja.length})</h2>
            <div className="space-y-2">
              {dadosDeBaja.map((e) => (
                <div key={e.id} className="flex items-center justify-between border-b border-[#F5EFE3] pb-2 last:border-0">
                  <p className="text-sm text-[#8a8471]">{e.nombre}</p>
                  <p className="text-xs text-[#8a8471]">baja {new Date(e.fecha_baja).toLocaleDateString('es-AR')}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
