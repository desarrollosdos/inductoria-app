import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';

export default function Dashboard({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nombreCuenta, setNombreCuenta] = useState('');
  const [creandoCuenta, setCreandoCuenta] = useState(false);

  const [nombreNegocio, setNombreNegocio] = useState('');
  const [creandoNegocio, setCreandoNegocio] = useState(false);

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
      .insert({ owner_id: session.user.id, nombre: nombreCuenta.trim(), plan: 'inactive' })
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

  if (loading) {
    return <p className="text-center mt-24 text-[#6b6455]">Cargando...</p>;
  }

  if (!cuenta) {
    return (
      <div className="max-w-md mx-auto mt-8 px-4">
        <div className="bg-white rounded-2xl p-6 border border-[#EFDDCE]">
          <h2 className="text-lg font-bold text-[#2C2C2A] mb-2">¿Cómo se llama tu negocio?</h2>
          <form onSubmit={handleCrearCuenta} className="space-y-3">
            <input
              type="text"
              required
              value={nombreCuenta}
              onChange={(e) => setNombreCuenta(e.target.value)}
              placeholder="Nombre de tu negocio"
              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={creandoCuenta}
              className="w-full py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:opacity-60"
            >
              {creandoCuenta ? 'Creando...' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <div className="max-w-4xl mx-auto mt-6 px-4 pb-16 space-y-6">
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h1 className="text-xl font-bold text-[#2C2C2A] mb-1">{cuenta.nombre}</h1>
          <p className="text-sm text-[#6b6455]">
            Suscripción:{' '}
            <span className={cuenta.plan === 'active' ? 'text-[#3F7D5C] font-semibold' : 'text-[#C1502E] font-semibold'}>
              {cuenta.plan === 'active' ? 'Activa' : 'Inactiva'}
            </span>
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h2 className="font-semibold text-[#2C2C2A] mb-3">Sucursales</h2>

          {negocios.length === 0 && (
            <p className="text-sm text-[#6b6455] mb-3">Todavía no cargaste ninguna sucursal.</p>
          )}

          <ul className="mb-4 space-y-1">
            {negocios.map((n) => (
              <li key={n.id} className="text-sm text-[#2C2C2A]">
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
              className="flex-1 border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={creandoNegocio}
              className="px-4 py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:opacity-60"
            >
              Agregar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
