import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';

function IconProgresoMini(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

export default function Progreso({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [filas, setFilas] = useState([]);
  const [totalCursos, setTotalCursos] = useState(0);
  const [loading, setLoading] = useState(true);

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

    if (!cuentaData) {
      setLoading(false);
      return;
    }

    const { count: cursosCount } = await supabase
      .from('microcursos')
      .select('*', { count: 'exact', head: true })
      .eq('cuenta_id', cuentaData.id)
      .eq('estado', 'aprobado');
    setTotalCursos(cursosCount || 0);

    const { data: negociosData } = await supabase
      .from('negocios')
      .select('id, nombre')
      .eq('cuenta_id', cuentaData.id);

    const negocioIds = (negociosData || []).map((n) => n.id);
    if (negocioIds.length === 0) {
      setFilas([]);
      setLoading(false);
      return;
    }

    const { data: empleadosData } = await supabase
      .from('empleados')
      .select('id, nombre, negocio_id, fecha_alta')
      .in('negocio_id', negocioIds)
      .is('fecha_baja', null)
      .order('fecha_alta', { ascending: false });

    const empleadoIds = (empleadosData || []).map((e) => e.id);

    let progresoPorEmpleado = {};
    if (empleadoIds.length > 0) {
      const { data: progresoData } = await supabase
        .from('progreso_empleado')
        .select('empleado_id, completado')
        .in('empleado_id', empleadoIds);

      (progresoData || []).forEach((p) => {
        if (!progresoPorEmpleado[p.empleado_id]) progresoPorEmpleado[p.empleado_id] = 0;
        if (p.completado) progresoPorEmpleado[p.empleado_id]++;
      });
    }

    const negociosPorId = {};
    (negociosData || []).forEach((n) => (negociosPorId[n.id] = n.nombre));

    const filasArmadas = (empleadosData || []).map((e) => ({
      ...e,
      negocioNombre: negociosPorId[e.negocio_id] || '—',
      completados: progresoPorEmpleado[e.id] || 0,
    }));

    setFilas(filasArmadas);
    setLoading(false);
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

  const promedioGeneral =
    totalCursos > 0 && filas.length > 0
      ? Math.round(
          filas.reduce((acc, f) => acc + f.completados / totalCursos, 0) / filas.length * 100
        )
      : 0;

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <EstadoBar
        session={session}
        icon={IconProgresoMini}
        label="Progreso"
        right={
          <div
            className="w-10 h-10 rounded-full border-2 border-[#C1502E] flex items-center justify-center flex-shrink-0"
          >
            <span className="text-xs font-bold text-[#C1502E]">{promedioGeneral}%</span>
          </div>
        }
      />
      <div className="max-w-4xl mx-auto mt-4 px-4 pb-16 space-y-6">
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h2 className="font-semibold text-[#2C2C2A] mb-1">Progreso del equipo</h2>
          <p className="text-sm text-[#6b6455]">
            {totalCursos === 0
              ? 'Todavía no tenés cursos aprobados cargados.'
              : `${totalCursos} curso${totalCursos === 1 ? '' : 's'} aprobado${totalCursos === 1 ? '' : 's'} en total.`}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          {filas.length === 0 ? (
            <p className="text-sm text-[#6b6455]">Todavía no tenés empleados activos dados de alta.</p>
          ) : (
            <div className="space-y-3">
              {filas.map((f) => {
                const porcentaje = totalCursos > 0 ? Math.round((f.completados / totalCursos) * 100) : 0;
                return (
                  <div key={f.id} className="border-b border-[#EDE0C8] pb-3 last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-[#2C2C2A]">{f.nombre}</p>
                      <p className="text-xs text-[#8a8471]">
                        {f.completados}/{totalCursos} cursos · {f.negocioNombre}
                      </p>
                    </div>
                    <div className="w-full h-2 bg-[#EDE0C8] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#3F7D5C] rounded-full"
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
