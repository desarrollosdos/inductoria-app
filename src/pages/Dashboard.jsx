import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Dashboard({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nombreCuenta, setNombreCuenta] = useState('');
  const [creandoCuenta, setCreandoCuenta] = useState(false);

  const [nombreNegocio, setNombreNegocio] = useState('');
  const [creandoNegocio, setCreandoNegocio] = useState(false);

  const [negocioSeleccionado, setNegocioSeleccionado] = useState('');
  const [nombreEmpleado, setNombreEmpleado] = useState('');
  const [creandoEmpleado, setCreandoEmpleado] = useState(false);
  const [ultimoLink, setUltimoLink] = useState(null);

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarTodo() {
    setLoading(true);
    const { data: cuentaData, error: cuentaError } = await supabase
      .from('cuentas')
      .select('*')
      .eq('owner_id', session.user.id)
      .maybeSingle();

    if (cuentaError) console.error(cuentaError);
    setCuenta(cuentaData);

    if (cuentaData) {
      const { data: negociosData, error: negociosError } = await supabase
        .from('negocios')
        .select('*')
        .eq('cuenta_id', cuentaData.id)
        .order('created_at', { ascending: true });

      if (negociosError) console.error(negociosError);
      setNegocios(negociosData || []);
    }

    setLoading(false);
  }

  async function handleCrearCuenta(e) {
    e.preventDefault();
    if (!nombreCuenta.trim()) return;
    setCreandoCuenta(true);

    const { data, error } = await supabase
      .from('cuentas')
      .insert({ owner_id: session.user.id, nombre: nombreCuenta.trim() })
      .select()
      .single();

    setCreandoCuenta(false);

    if (error) {
      console.error(error);
      return;
    }
    setCuenta(data);
  }

  async function handleCrearNegocio(e) {
    e.preventDefault();
    if (!nombreNegocio.trim()) return;
    setCreandoNegocio(true);

    const { data, error } = await supabase
      .from('negocios')
      .insert({ cuenta_id: cuenta.id, nombre: nombreNegocio.trim() })
      .select()
      .single();

    setCreandoNegocio(false);

    if (error) {
      console.error(error);
      return;
    }
    setNegocios([...negocios, data]);
    setNombreNegocio('');
  }

  async function handleCrearEmpleado(e) {
    e.preventDefault();
    if (!nombreEmpleado.trim() || !negocioSeleccionado) return;
    setCreandoEmpleado(true);
    setUltimoLink(null);

    const { data, error } = await supabase
      .from('empleados')
      .insert({ negocio_id: negocioSeleccionado, nombre: nombreEmpleado.trim() })
      .select()
      .single();

    setCreandoEmpleado(false);

    if (error) {
      console.error(error);
      return;
    }

    const link = `${window.location.origin}/empleado?token=${data.token_acceso}`;
    setUltimoLink(link);
    setNombreEmpleado('');
  }

  if (loading) {
    return <p className="text-center mt-24 text-[#6b7a80]">Cargando...</p>;
  }

  if (!cuenta) {
    return (
      <div className="max-w-md mx-auto mt-8 px-4">
        <div className="bg-white rounded-2xl p-6 border border-slate-100">
          <h2 className="text-lg font-bold text-[#1B2A3D] mb-2">¿Cómo se llama tu negocio?</h2>
          <form onSubmit={handleCrearCuenta} className="space-y-3">
            <input
              type="text"
              required
              value={nombreCuenta}
              onChange={(e) => setNombreCuenta(e.target.value)}
              placeholder="Nombre de tu negocio"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={creandoCuenta}
              className="w-full py-2 rounded-lg font-semibold text-white bg-[#D69A2D] disabled:opacity-60"
            >
              {creandoCuenta ? 'Creando...' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto mt-10 px-4 pb-16 space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h1 className="text-xl font-bold text-[#1B2A3D] mb-1">{cuenta.nombre}</h1>
        <p className="text-sm text-[#6b7a80]">Plan: {cuenta.plan}</p>
      </div>

      {/* Sucursales */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h2 className="font-semibold text-[#1B2A3D] mb-3">Sucursales</h2>

        {negocios.length === 0 && (
          <p className="text-sm text-[#6b7a80] mb-3">Todavía no cargaste ninguna sucursal.</p>
        )}

        <ul className="mb-4 space-y-1">
          {negocios.map((n) => (
            <li key={n.id} className="text-sm text-[#1B2A3D]">
              {n.nombre}
            </li>
          ))}
        </ul>

        <form onSubmit={handleCrearNegocio} className="flex gap-2">
          <input
            type="text"
            value={nombreNegocio}
            onChange={(e) => setNombreNegocio(e.target.value)}
            placeholder="Nombre de la sucursal (ej: Local Palermo)"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={creandoNegocio}
            className="px-4 py-2 rounded-lg font-semibold text-white bg-[#D69A2D] disabled:opacity-60"
          >
            Agregar
          </button>
        </form>
      </div>

      {/* Empleados */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h2 className="font-semibold text-[#1B2A3D] mb-3">Dar de alta un empleado</h2>

        {negocios.length === 0 ? (
          <p className="text-sm text-[#6b7a80]">
            Primero cargá al menos una sucursal para poder dar de alta empleados.
          </p>
        ) : (
          <form onSubmit={handleCrearEmpleado} className="space-y-3">
            <select
              value={negocioSeleccionado}
              onChange={(e) => setNegocioSeleccionado(e.target.value)}
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
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
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={creandoEmpleado}
              className="w-full py-2 rounded-lg font-semibold text-white bg-[#D69A2D] disabled:opacity-60"
            >
              {creandoEmpleado ? 'Creando...' : 'Dar de alta'}
            </button>
          </form>
        )}

        {ultimoLink && (
          <div className="mt-4 bg-[#F2F0EA] border border-[#DCD6C2] rounded-lg p-3 text-sm">
            <p className="text-[#1B2A3D] mb-1 font-semibold">Mandale este link al empleado:</p>
            <p className="text-[#4a4536] break-all">{ultimoLink}</p>
          </div>
        )}
      </div>
    </div>
  );
}
