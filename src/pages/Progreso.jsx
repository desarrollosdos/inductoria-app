import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';

function IconProgresoMini(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

function Avatar({ e, size = 32 }) {
  const estilo = { width: size, height: size, border: '2px solid #C1502E' };
  if (e.foto_url) {
    return <img src={e.foto_url} alt={e.nombre} style={estilo} className="rounded-full object-cover flex-shrink-0" />;
  }
  return (
    <div style={estilo} className="rounded-full bg-[#EDE0C8] text-[#8a8471] font-bold flex items-center justify-center flex-shrink-0 text-xs">
      {e.nombre.charAt(0).toUpperCase()}
    </div>
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
      .select('id, nombre, negocio_id, fecha_alta, foto_url')
      .in('negocio_id', negocioIds)
      .is('fecha_baja', null)
      .order('fecha_alta', { ascending: false });

    const empleadoIds = (empleadosData || []).map((e) => e.id);

    let progresoPorEmpleado = {};
    if (empleadoIds.length > 0) {
      const { data: progresoData } = await supabase
        .from('progreso_empleado')
        .select('empleado_id, completado, fecha_completado')
        .in('empleado_id', empleadoIds);

      (progresoData || []).forEach((p) => {
        if (!progresoPorEmpleado[p.empleado_id]) {
          progresoPorEmpleado[p.empleado_id] = { completados: 0, ultimaActividad: null };
        }
        if (p.completado) {
          progresoPorEmpleado[p.empleado_id].completados++;
          if (
            p.fecha_completado &&
            (!progresoPorEmpleado[p.empleado_id].ultimaActividad ||
              p.fecha_completado > progresoPorEmpleado[p.empleado_id].ultimaActividad)
          ) {
            progresoPorEmpleado[p.empleado_id].ultimaActividad = p.fecha_completado;
          }
        }
      });
    }

    const negociosPorId = {};
    (negociosData || []).forEach((n) => (negociosPorId[n.id] = n.nombre));

    const filasArmadas = (empleadosData || []).map((e) => ({
      ...e,
      negocioNombre: negociosPorId[e.negocio_id] || '—',
      completados: progresoPorEmpleado[e.id]?.completados || 0,
      ultimaActividad: progresoPorEmpleado[e.id]?.ultimaActividad || null,
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
      ? Math.round((filas.reduce((acc, f) => acc + f.completados / totalCursos, 0) / filas.length) * 100)
      : 0;

  // Métricas inspiradas en lo que muestran plataformas de capacitación
  // como Crehana: no solo el promedio, también quién arrancó y quién no,
  // y quién viene más activo.
  const yaArrancaron = filas.filter((f) => f.completados > 0).length;
  const masActivo = filas.length > 0 ? [...filas].sort((a, b) => b.completados - a.completados)[0] : null;

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <PageShell>
        <EstadoBar
          icon={IconProgresoMini}
          label="Progreso"
          right={
            <div className="w-10 h-10 rounded-full border-2 border-[#C1502E] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-[#C1502E]">{promedioGeneral}%</span>
            </div>
          }
        />
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h2 className="font-semibold text-[#2C2C2A] mb-3">Progreso del equipo</h2>
          {totalCursos === 0 ? (
            <p className="text-sm text-[#6b6455]">Todavía no tenés cursos aprobados cargados.</p>
          ) : (
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#C1502E] text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                {totalCursos}
              </span>
              <p className="text-sm font-medium text-[#3d382c]">cursos aprobados</p>
            </div>
          )}
        </div>

        {filas.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-[#EFDDCE] p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-1">
                Ya arrancaron
              </p>
              <p className="text-2xl font-bold text-[#2C2C2A]">
                {yaArrancaron}/{filas.length}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-[#EFDDCE] p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-1">
                Más activo
              </p>
              {masActivo ? (
                <div className="flex items-center gap-2 mt-1">
                  <Avatar e={masActivo} size={28} />
                  <p className="text-sm font-bold text-[#2C2C2A] truncate">{masActivo.nombre}</p>
                </div>
              ) : (
                <p className="text-sm text-[#8a8471] mt-1">Todavía nadie</p>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          {filas.length === 0 ? (
            <p className="text-sm text-[#6b6455]">Todavía no tenés empleados activos dados de alta.</p>
          ) : (
            <div className="space-y-3">
              {filas.map((f) => {
                const porcentaje = totalCursos > 0 ? Math.round((f.completados / totalCursos) * 100) : 0;
                return (
                  <div key={f.id} className="border-b border-[#EDE0C8] pb-3 last:border-0">
                    <div className="flex items-center gap-3 mb-1">
                      <Avatar e={f} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-[#2C2C2A]">{f.nombre}</p>
                          <p className="text-xs text-[#8a8471]">
                            {f.completados}/{totalCursos} cursos · {f.negocioNombre}
                          </p>
                        </div>
                        {f.ultimaActividad && (
                          <p className="text-[10px] text-[#8a8471]">
                            Última actividad: {new Date(f.ultimaActividad).toLocaleDateString('es-AR')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-2 bg-[#EDE0C8] rounded-full overflow-hidden">
                      <div className="h-full bg-[#3F7D5C] rounded-full" style={{ width: `${porcentaje}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PageShell>
    </div>
  );
}
