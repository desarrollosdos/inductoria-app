import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import { esCursoSeguridadEHigiene, CursoCompletadoFila, TituloCursoInline } from '../components/Badges';

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
  const [cursosRanking, setCursosRanking] = useState([]);
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
      .select('id, nombre, negocio_id, fecha_alta, foto_url, token_acceso, pin')
      .in('negocio_id', negocioIds)
      .is('fecha_baja', null)
      .order('fecha_alta', { ascending: false });

    const empleadoIds = (empleadosData || []).map((e) => e.id);

    const { data: cursosData } = await supabase
      .from('microcursos')
      .select('id, titulo')
      .eq('cuenta_id', cuentaData.id)
      .eq('estado', 'aprobado');
    const tituloPorCurso = {};
    (cursosData || []).forEach((c) => (tituloPorCurso[c.id] = c.titulo));

    let progresoPorEmpleado = {};
    const conteoPorCurso = {};
    if (empleadoIds.length > 0) {
      const { data: progresoData } = await supabase
        .from('progreso_empleado')
        .select('empleado_id, microcurso_id, completado, fecha_completado')
        .in('empleado_id', empleadoIds);

      (progresoData || []).forEach((p) => {
        if (!progresoPorEmpleado[p.empleado_id]) {
          progresoPorEmpleado[p.empleado_id] = { completados: 0, ultimaActividad: null, badges: [] };
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
          const titulo = tituloPorCurso[p.microcurso_id] || 'Curso';
          progresoPorEmpleado[p.empleado_id].badges.push({
            microcurso_id: p.microcurso_id,
            titulo,
            especial: esCursoSeguridadEHigiene(titulo),
          });
          conteoPorCurso[p.microcurso_id] = (conteoPorCurso[p.microcurso_id] || 0) + 1;
        }
      });
    }

    const cursosRanking = Object.entries(conteoPorCurso)
      .map(([microcurso_id, cantidad]) => ({
        microcurso_id,
        titulo: tituloPorCurso[microcurso_id] || 'Curso',
        cantidad,
        especial: esCursoSeguridadEHigiene(tituloPorCurso[microcurso_id]),
      }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);
    setCursosRanking(cursosRanking);

    const negociosPorId = {};
    (negociosData || []).forEach((n) => (negociosPorId[n.id] = n.nombre));

    const filasArmadas = (empleadosData || []).map((e) => ({
      ...e,
      negocioNombre: negociosPorId[e.negocio_id] || '—',
      completados: progresoPorEmpleado[e.id]?.completados || 0,
      ultimaActividad: progresoPorEmpleado[e.id]?.ultimaActividad || null,
      badges: progresoPorEmpleado[e.id]?.badges || [],
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
  const podio = [...filas]
    .filter((f) => f.completados > 0)
    .sort((a, b) => b.completados - a.completados)
    .slice(0, 3);
  const sinArrancar = filas.filter((f) => f.completados === 0);

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

        {podio.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-4">Ranking del equipo</h2>
            <div className="space-y-3">
              {podio.map((f, i) => (
                <div key={f.id} className="flex items-center gap-3">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      i === 0
                        ? 'bg-[#F0C349] text-[#7A3A1D]'
                        : i === 1
                        ? 'bg-[#D8D8D8] text-[#3d382c]'
                        : 'bg-[#D89B6B] text-white'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <Avatar e={f} size={30} />
                  <p className="text-sm font-semibold text-[#2C2C2A] flex-1 truncate">{f.nombre}</p>
                  <p className="text-xs font-semibold text-[#C1502E]">
                    {f.completados} curso{f.completados === 1 ? '' : 's'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {cursosRanking.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-4">Cursos más realizados</h2>
            <div className="space-y-2">
              {cursosRanking.map((c) => {
                const maxCantidad = cursosRanking[0].cantidad;
                const porcentajeBarra = maxCantidad > 0 ? Math.round((c.cantidad / maxCantidad) * 100) : 0;
                return (
                  <div key={c.microcurso_id}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[13px] font-medium truncate">
                        <TituloCursoInline titulo={c.titulo} />
                        {c.especial && <span className="ml-1 text-[#C1502E]">★</span>}
                      </p>
                      <span className="text-xs font-semibold text-[#8a8471] flex-shrink-0 ml-2">
                        {c.cantidad} empleado{c.cantidad === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[#EDE0C8] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#C1502E] rounded-full"
                        style={{ width: `${porcentajeBarra}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sinArrancar.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-1">Todavía no arrancaron ({sinArrancar.length})</h2>
            <p className="text-xs text-[#8a8471] mb-3">Puede que necesiten un empujón para empezar.</p>
            <div className="space-y-2">
              {sinArrancar.map((f) => (
                <div key={f.id} className="flex items-center gap-3">
                  <Avatar e={f} size={26} />
                  <p className="text-sm text-[#2C2C2A]">{f.nombre}</p>
                  <p className="text-xs text-[#8a8471]">· {f.negocioNombre}</p>
                </div>
              ))}
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
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {totalCursos > 0 && f.completados < totalCursos && (
                              <>
                                <button
                                  onClick={() => alert(`PIN de ${f.nombre}: ${f.pin}`)}
                                  title="Ver PIN de acceso"
                                  className="w-6 h-6 rounded-full bg-[#C1502E] text-white flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                                >
                                  PIN
                                </button>
                                <button
                                  onClick={() => {
                                    const link = `${window.location.origin}/empleado?token=${f.token_acceso}`;
                                    navigator.clipboard.writeText(link);
                                    alert('Link copiado');
                                  }}
                                  title="Copiar link de acceso"
                                  className="w-6 h-6 rounded-full bg-[#EDE0C8] text-[#2C2C2A] flex items-center justify-center flex-shrink-0"
                                >
                                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                </button>
                              </>
                            )}
                            <p className="text-xs font-medium text-[#3d382c] whitespace-nowrap">
                              {f.completados}/{totalCursos} cursos · {f.negocioNombre}
                            </p>
                          </div>
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
                    {f.badges.length > 0 && (
                      <div className="flex flex-col gap-1.5 mt-2">
                        {f.badges.map((b) => (
                          <CursoCompletadoFila key={b.microcurso_id} titulo={b.titulo} especial={b.especial} />
                        ))}
                      </div>
                    )}
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
