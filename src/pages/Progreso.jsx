import { useEffect, useState } from 'react';
import { generarCertificadoPDF } from '../lib/certificado';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import TrialBanner from '../components/TrialBanner';
import { esCursoSeguridadEHigiene, CursoCompletadoFila, TituloCursoInline } from '../components/Badges';

// Mismo ícono que usa DashboardNav.jsx para el tab "Progreso" (antes este
// era un ícono de gráfico de barras distinto al del menú).
function IconProgresoMini(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 14.2 6.5 21l5.5-3 5.5 3-2-6.8" />
    </svg>
  );
}

function IconQR(props) {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" />
    </svg>
  );
}

function IconBirrete(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3 2 8l10 5 10-5-10-5z" />
      <path d="M6 10.5V16c0 1.4 2.5 2.8 6 2.8s6-1.4 6-2.8v-5.5" />
      <path d="M22 8v6" />
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

// Reemplaza la barra continua + "X/Y cursos": un casillero por curso que
// le corresponde al empleado según su puesto, numerado, en verde salvia
// los que ya completó. Se ve de un vistazo cuántos le faltan sin tener
// que leer la fracción aparte. Ancho acotado (no ocupa todo el ancho en
// mobile) para que quede discreta.
function BarraSegmentada({ completados, total }) {
  if (total === 0) {
    return <p className="text-[10px] text-[#8a8471] mt-1.5">Sin cursos para su puesto todavía.</p>;
  }
  return (
    <div className="flex gap-0.5 mt-1.5" style={{ maxWidth: 220 }}>
      {Array.from({ length: total }, (_, i) => {
        const hecho = i < completados;
        return (
          <div
            key={i}
            className={`flex-1 h-[13px] rounded flex items-center justify-center text-[8px] font-bold ${
              hecho ? 'bg-[#7C8B6F] text-white' : 'bg-[#EDE0C8] text-[#a89f8a]'
            }`}
          >
            {i + 1}
          </div>
        );
      })}
    </div>
  );
}

// Una fila de empleado dentro de "Tu equipo": avatar, acciones (PIN, link,
// QR), barra segmentada de progreso y certificados de lo completado. Se usa
// tanto en la vista agrupada por sucursal como en la vista por empleado
// (alfabética, sin agrupar) — misma fila, distinto criterio de orden afuera.
function FilaEmpleadoEquipo({ f, qrAbierto, setQrAbierto }) {
  const linkAcceso = `${window.location.origin}/empleado?token=${f.token_acceso}`;
  return (
    <div className="px-6 py-2.5 border-t border-[#F3EEE1]">
      <div className="flex items-center gap-3 mb-1">
        <Avatar e={f} />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#2C2C2A]">{f.nombre}</p>
            {f.totalCursos > 0 && f.completados < f.totalCursos && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => alert(`PIN de ${f.nombre}: ${f.pin}`)}
                  title="Ver PIN de acceso"
                  className="w-6 h-6 rounded-full bg-[#C1502E] text-white flex items-center justify-center text-[8px] font-bold tracking-wide flex-shrink-0"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                >
                  PIN
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(linkAcceso);
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
                <button
                  onClick={() => setQrAbierto(qrAbierto === f.id ? null : f.id)}
                  title="Ver código QR"
                  className="w-6 h-6 rounded-full bg-[#EDE0C8] text-[#2C2C2A] flex items-center justify-center flex-shrink-0"
                >
                  <IconQR />
                </button>
              </div>
            )}
          </div>
          {f.ultimaActividad && (
            <p className="text-[10px] text-[#8a8471]">
              Última actividad: {new Date(f.ultimaActividad).toLocaleDateString('es-AR')}
            </p>
          )}
          <BarraSegmentada completados={f.completados} total={f.totalCursos} />
        </div>
      </div>

      {qrAbierto === f.id && (
        <div className="mt-2 mb-1 bg-[#EDE0C8] rounded-lg p-3 flex items-center gap-3">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(linkAcceso)}`}
            alt={`Código QR de acceso para ${f.nombre}`}
            width={110}
            height={110}
            className="rounded-lg bg-white p-1 flex-shrink-0"
          />
          <div>
            <p className="text-xs font-semibold text-[#2C2C2A]">
              Escaneá desde el celular del empleado
            </p>
            <p className="text-xs text-[#8a8471] mt-1">
              PIN: <span className="font-bold text-[#C1502E]">{f.pin}</span>
            </p>
            <button
              onClick={() => setQrAbierto(null)}
              className="text-[10px] font-semibold text-[#8a8471] underline mt-2"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {f.badges.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-2">
          {f.badges.map((b) => (
            <div key={b.microcurso_id} className="flex items-center justify-between gap-2">
              <CursoCompletadoFila titulo={b.titulo} />
              <button
                type="button"
                onClick={() =>
                  generarCertificadoPDF({
                    nombreEmpleado: f.nombre,
                    negocioNombre: f.negocioNombre,
                    tituloCurso: b.titulo,
                    puntaje: b.puntaje,
                    fechaCompletado: b.fecha_completado,
                  })
                }
                className="text-[10px] font-bold tracking-wide text-white bg-[#6B655A] rounded-full px-2 py-0.5 flex-shrink-0"
                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
              >
                Certificado
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Progreso({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [filas, setFilas] = useState([]);
  const [totalCursos, setTotalCursos] = useState(0);
  const [cursosRanking, setCursosRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qrAbierto, setQrAbierto] = useState(null);
  // Vista de "Tu equipo": agrupada por sucursal, o alfabética por empleado
  // sin agrupar (útil cuando un curso aplica a todas las sucursales y el
  // dueño quiere ver a todo el equipo junto, no separado por local).
  const [vistaEquipo, setVistaEquipo] = useState('sucursal');

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
      .select('id, nombre, puesto, negocio_id, fecha_alta, foto_url, token_acceso, pin')
      .in('negocio_id', negocioIds)
      .is('fecha_baja', null)
      .order('fecha_alta', { ascending: false });

    const empleadoIds = (empleadosData || []).map((e) => e.id);

    const { data: cursosData } = await supabase
      .from('microcursos')
      .select('id, titulo, puestos_aplicables')
      .eq('cuenta_id', cuentaData.id)
      .eq('estado', 'aprobado');
    const tituloPorCurso = {};
    (cursosData || []).forEach((c) => (tituloPorCurso[c.id] = c.titulo));

    // Total de cursos que le corresponden a CADA empleado según su puesto,
    // no el total global de la cuenta. Mismo criterio que empleado-info:
    // sin puestos_aplicables = todavía no publicado (no cuenta); 'TODOS'
    // explícito = aplica a cualquiera; puestos puntuales = solo esos.
    function totalCursosParaPuesto(puesto) {
      return (cursosData || []).filter((c) => {
        const puestos = c.puestos_aplicables;
        if (!puestos || puestos.length === 0) return false;
        if (puestos.includes('TODOS')) return true;
        return puesto && puestos.includes(puesto);
      }).length;
    }

    let progresoPorEmpleado = {};
    const conteoPorCurso = {};
    if (empleadoIds.length > 0) {
      const { data: progresoData } = await supabase
        .from('progreso_empleado')
        .select('empleado_id, microcurso_id, completado, fecha_completado, puntaje')
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
            puntaje: p.puntaje,
            fecha_completado: p.fecha_completado,
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
      totalCursos: totalCursosParaPuesto(e.puesto),
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
          <a href="/sucursales" className="inline-block px-5 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]" style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>
            Ir a Sucursales
          </a>
        </div>
      </div>
    );
  }

  const promedioGeneral =
    filas.length > 0
      ? Math.round(
          (filas.reduce((acc, f) => acc + (f.totalCursos > 0 ? f.completados / f.totalCursos : 0), 0) /
            filas.length) *
            100
        )
      : 0;

  // Métricas inspiradas en lo que muestran plataformas de capacitación
  // como Crehana: no solo el promedio, también quién arrancó y quién no,
  // y quién viene más activo.
  const yaArrancaron = filas.filter((f) => f.completados > 0).length;
  // "Más activo": solo se muestra a alguien si tiene ESTRICTAMENTE más
  // cursos completados que el resto. Si hay empate en el máximo (varios
  // con la misma cantidad, ninguno se destaca), no se elige a nadie —
  // antes se mostraba al primero del sort aunque estuviera empatado.
  const maxCompletados = filas.length > 0 ? Math.max(...filas.map((f) => f.completados)) : 0;
  const empatadosEnMax = filas.filter((f) => f.completados === maxCompletados);
  const masActivo = maxCompletados > 0 && empatadosEnMax.length === 1 ? empatadosEnMax[0] : null;
  const hayEmpateActivo = maxCompletados > 0 && empatadosEnMax.length > 1;
  const podio = [...filas]
    .filter((f) => f.completados > 0)
    .sort((a, b) => b.completados - a.completados)
    .slice(0, 3);
  const maxPodio = podio.length > 0 ? podio[0].completados : 0;
  const sinArrancar = filas.filter((f) => f.completados === 0);

  // Sección "Tu equipo": agrupada por sucursal (en vez de mostrar el
  // nombre de la sucursal repetido al lado de cada empleado), y
  // alfabético adentro de cada grupo para encontrar a alguien rápido.
  const gruposPorSucursal = (() => {
    const mapa = {};
    filas.forEach((f) => {
      const clave = f.negocio_id || 'sin-sucursal';
      if (!mapa[clave]) mapa[clave] = { nombre: f.negocioNombre, empleados: [] };
      mapa[clave].empleados.push(f);
    });
    return Object.values(mapa)
      .map((g) => ({
        ...g,
        empleados: [...g.empleados].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  })();

  // Vista alternativa "por empleado": todos juntos, alfabético, sin
  // separar por sucursal.
  const filasPorEmpleado = [...filas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <PageShell>
        <TrialBanner cuenta={cuenta} />
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
              <span
                className="w-8 h-8 rounded-full bg-[#C1502E] text-white font-bold text-xs flex items-center justify-center flex-shrink-0"
                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
              >
                {totalCursos}
              </span>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#3d382c]">CURSOS APROBADOS</p>
            </div>
          )}
        </div>

        {filas.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-[#EFDDCE] p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-2">
                Ya arrancaron
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#C1502E] flex items-center justify-center flex-shrink-0">
                  <span
                    className="text-sm font-bold tracking-wide text-white"
                    style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                  >
                    {Math.round((yaArrancaron / filas.length) * 100)}%
                  </span>
                </div>
                <p className="text-[13px] font-bold tracking-wide text-[#3d382c]">
                  {yaArrancaron} de {filas.length} empleado{filas.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-[#EFDDCE] p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-2">
                Más activo
              </p>
              {masActivo ? (
                <div className="flex items-center gap-3">
                  <Avatar e={masActivo} size={32} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#2C2C2A] leading-tight break-words">{masActivo.nombre}</p>
                    <p className="text-[13px] font-bold tracking-wide text-[#3d382c]">
                      {masActivo.completados} curso{masActivo.completados === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              ) : hayEmpateActivo ? null : (
                <p className="text-sm text-[#8a8471] mt-1">Todavía nadie</p>
              )}
            </div>
          </div>
        )}

        {podio.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-4">Ranking del equipo</h2>
            <div className="space-y-4">
              {podio.map((f) => {
                const anchoBarra = maxPodio > 0 ? Math.round((f.completados / maxPodio) * 100) : 0;
                return (
                  <div key={f.id} className="flex items-center gap-3">
                    <Avatar e={f} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-[#2C2C2A] truncate">{f.nombre}</p>
                        <span className="text-xs font-bold tracking-wide text-[#7C8B6F] flex-shrink-0 ml-2">
                          {f.completados} curso{f.completados === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#EDE0C8] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#7C8B6F] transition-all"
                          style={{ width: `${anchoBarra}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {cursosRanking.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-4">Cursos más realizados</h2>
            <div className="space-y-3">
              {cursosRanking.map((c) => (
                <div key={c.microcurso_id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#EDE0C8] flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-[#C1502E]">{c.cantidad}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">
                      <TituloCursoInline titulo={c.titulo} corto />
                    </p>
                    <p className="text-[11px] text-[#8a8471]">
                      empleado{c.cantidad === 1 ? '' : 's'} que lo completaron
                    </p>
                  </div>
                </div>
              ))}
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

        <div className="bg-white rounded-2xl border border-[#EFDDCE] border-t-[3px] border-t-[#C1502E] overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 pt-4 pb-2">
            <div className="w-[26px] h-[26px] rounded-full bg-[#C1502E] flex items-center justify-center flex-shrink-0">
              <IconBirrete className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-[#2C2C2A] text-[14.5px]">Tu equipo</h2>
              <p className="text-[11px] text-[#8a8471]">Acá activás los cursos de cada empleado</p>
            </div>
          </div>

          {gruposPorSucursal.length > 1 && (
            <div className="flex gap-1.5 px-6 pb-3">
              <button
                type="button"
                onClick={() => setVistaEquipo('sucursal')}
                className={`text-[11px] font-bold tracking-wide px-3 py-1 rounded-full ${
                  vistaEquipo === 'sucursal' ? 'bg-[#C1502E] text-white' : 'bg-[#EDE0C8] text-[#8a8471]'
                }`}
                style={vistaEquipo === 'sucursal' ? { textShadow: '0 1px 1px rgba(0,0,0,0.35)' } : undefined}
              >
                Por sucursal
              </button>
              <button
                type="button"
                onClick={() => setVistaEquipo('empleado')}
                className={`text-[11px] font-bold tracking-wide px-3 py-1 rounded-full ${
                  vistaEquipo === 'empleado' ? 'bg-[#C1502E] text-white' : 'bg-[#EDE0C8] text-[#8a8471]'
                }`}
                style={vistaEquipo === 'empleado' ? { textShadow: '0 1px 1px rgba(0,0,0,0.35)' } : undefined}
              >
                Por empleado
              </button>
            </div>
          )}

          {filas.length === 0 ? (
            <p className="text-sm text-[#6b6455] px-6 pb-6">Todavía no tenés empleados activos dados de alta.</p>
          ) : vistaEquipo === 'sucursal' ? (
            <div className="pb-2">
              {gruposPorSucursal.map((grupo) => (
                <div key={grupo.nombre}>
                  <p className="text-[11px] font-bold text-[#8a8471] uppercase tracking-wide px-6 pt-3 pb-1.5">
                    {grupo.nombre}
                  </p>
                  {grupo.empleados.map((f) => (
                    <FilaEmpleadoEquipo key={f.id} f={f} qrAbierto={qrAbierto} setQrAbierto={setQrAbierto} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="pb-2">
              {filasPorEmpleado.map((f) => (
                <FilaEmpleadoEquipo key={f.id} f={f} qrAbierto={qrAbierto} setQrAbierto={setQrAbierto} />
              ))}
            </div>
          )}
        </div>
      </PageShell>
    </div>
  );
}
