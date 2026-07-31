import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';

function etiquetaPlan(plan) {
  if (plan === 'active') return 'Activa';
  if (plan === 'inactive') return 'Inactiva';
  return plan; // por si queda algún valor viejo cargado a mano
}

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

  useEffect(() => {
    cargarMetricas();
  }, []);

  async function cargarMetricas() {
    setCargando(true);
    setError(null);

    const { data, error } = await supabase.functions.invoke('admin-metrics', {
      method: 'GET',
    });

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

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <DashboardNav userEmail={session.user.email} />
      <div className="mt-8 px-4">
        <h1 className="text-2xl font-bold text-[#2C2C2A] mb-6">Panel de administración</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <Tarjeta label="Cuentas" valor={datos.totalCuentas} />
        <Tarjeta label="Sucursales" valor={datos.totalNegocios} />
        <Tarjeta label="Empleados activos" valor={datos.totalEmpleadosActivos} />
        <Tarjeta label="Cursos" valor={datos.totalMicrocursos} />
      </div>

      <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6 mb-8">
        <h2 className="font-semibold text-[#2C2C2A] mb-4">Cuentas por plan</h2>
        <div className="flex gap-6 flex-wrap">
          {Object.entries(datos.planCounts).length === 0 && (
            <p className="text-sm text-[#6b6455]">Todavía no hay cuentas cargadas.</p>
          )}
          {Object.entries(datos.planCounts).map(([plan, cantidad]) => (
            <div key={plan}>
              <p className="text-2xl font-bold text-[#2C2C2A]">{cantidad}</p>
              <p className="text-xs text-[#8a8471] uppercase tracking-wide">{etiquetaPlan(plan)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
        <h2 className="font-semibold text-[#2C2C2A] mb-4">Últimas cuentas creadas</h2>
        {datos.ultimasCuentas.length === 0 ? (
          <p className="text-sm text-[#6b6455]">Todavía no hay cuentas cargadas.</p>
        ) : (
          <div className="space-y-2">
            {datos.ultimasCuentas.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between border-b border-[#F5EFE3] pb-2 last:border-0"
              >
                <div>
                  <p className="text-sm font-semibold text-[#2C2C2A]">{c.nombre}</p>
                  <p className="text-xs text-[#8a8471]">
                    {new Date(c.created_at).toLocaleDateString('es-AR')}
                  </p>
                </div>
                <span className="text-xs font-semibold uppercase text-[#C1502E]">{etiquetaPlan(c.plan)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
