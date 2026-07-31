import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';

export default function Empleados({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);

  const [negocioSeleccionado, setNegocioSeleccionado] = useState('');
  const [nombreEmpleado, setNombreEmpleado] = useState('');
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
        .order('created_at', { ascending: true });
      setNegocios(negociosData || []);

      const negocioIds = (negociosData || []).map((n) => n.id);
      if (negocioIds.length > 0) {
        const { data: empleadosData } = await supabase
          .from('empleados')
          .select('*')
          .in('negocio_id', negocioIds)
          .order('created_at', { ascending: false });
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
      .insert({ negocio_id: negocioSeleccionado, nombre: nombreEmpleado.trim() })
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
    setEmpleados([data, ...empleados]);
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
        <p className="text-center mt-12 text-[#6b6455]">
          Primero cargá el nombre de tu negocio en la pantalla de Sucursales.
        </p>
      </div>
    );
  }

  const activos = empleados.filter((e) => !e.fecha_baja);
  const dadosDeBaja = empleados.filter((e) => e.fecha_baja);

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <div className="max-w-4xl mx-auto mt-6 px-4 pb-16 space-y-6">
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h2 className="font-semibold text-[#2C2C2A] mb-3">Dar de alta un empleado</h2>

          {negocios.length === 0 ? (
            <p className="text-sm text-[#6b6455]">
              Primero cargá al menos una sucursal, en la pantalla de Sucursales.
            </p>
          ) : (
            <form onSubmit={handleCrearEmpleado} className="space-y-3">
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
              <button
                type="submit"
                disabled={creando}
                className="w-full py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:opacity-60"
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
          <h2 className="font-semibold text-[#2C2C2A] mb-3">Empleados activos ({activos.length})</h2>
          {activos.length === 0 ? (
            <p className="text-sm text-[#6b6455]">Todavía no diste de alta a nadie.</p>
          ) : (
            <div className="space-y-2">
              {activos.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between border-b border-[#F5EFE3] pb-2 last:border-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#2C2C2A]">{e.nombre}</p>
                    <p className="text-xs text-[#8a8471]">
                      {nombreNegocio(e.negocio_id)} · alta {new Date(e.fecha_alta).toLocaleDateString('es-AR')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleBaja(e.id)}
                    className="text-xs font-semibold text-[#C1502E] hover:underline"
                  >
                    Dar de baja
                  </button>
                </div>
              ))}
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
                  <p className="text-xs text-[#8a8471]">
                    baja {new Date(e.fecha_baja).toLocaleDateString('es-AR')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
