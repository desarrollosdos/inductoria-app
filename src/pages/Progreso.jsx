import { useEffect, useState, Fragment } from 'react';
import { generarCertificadoPDF } from '../lib/certificado';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import TrialBanner from '../components/TrialBanner';
import { esCursoSeguridadEHigiene, CursoCompletadoFila } from '../components/Badges';

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

function IconWhatsApp(props) {
  return (
    <svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" {...props}>
      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
    </svg>
  );
}

// Deja solo dígitos y, si el número no viene ya con el 54 de Argentina
// adelante, se lo agrega junto con el 9 que WhatsApp espera para
// celulares argentinos (formato wa.me: 549 + código de área + número,
// sin el 0 ni el 15). No valida números de otros países: si en algún
// momento hay empleados fuera de Argentina, esto va a necesitar ajustarse.
function formatoWhatsApp(telefono) {
  const soloDigitos = (telefono || '').replace(/\D/g, '');
  if (!soloDigitos) return null;
  return soloDigitos.startsWith('54') ? soloDigitos : `549${soloDigitos}`;
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

// Medalla con estrella (opción 2 del mock de "ícono de certificado" que
// eligió Roberto), usada en el botón que descarga el certificado PDF de
// un curso completado, en "Tu equipo".
function IconCertificado(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="6" />
      <path d="M8.5 13.5 7 22l5-3 5 3-1.5-8.5" />
    </svg>
  );
}

// Ícono de acuse de recibido: formulario con tilde. Mismo tamaño que PIN /
// copiar link / QR (24px, ícono interno de 11px) — no el de certificado,
// que es un poco más grande. El color del botón ya indica el estado (verde
// oliva confirmado, terracota pendiente), así que el ícono en sí queda
// neutro en blanco.
function IconActa(props) {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 14l2 2 4-4.5" />
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

// Anillo de progreso circular (opción 2 del mock de "Ranking del equipo"
// que eligió Roberto). El % que llena el anillo es completados/total DEL
// PROPIO empleado, no relativo al resto del podio — así dos empleados con
// los mismos cursos completados sobre el mismo total quedan visualmente
// idénticos, sin inventar una diferencia de lugar entre ellos.
function AnilloProgreso({ pct, size = 68, grosor = 7, color = '#7C8B6F', children }) {
  const r = (size - grosor) / 2;
  const circunferencia = 2 * Math.PI * r;
  const pctAcotado = Math.min(100, Math.max(0, pct));
  const offset = circunferencia * (1 - pctAcotado / 100);
  const centro = size / 2;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={centro} cy={centro} r={r} fill="none" stroke="#EDE0C8" strokeWidth={grosor} />
        <circle
          cx={centro}
          cy={centro}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-[#2C2C2A]">
        {children}
      </div>
    </div>
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
  const linkAcceso = `${window.location.origin}/e?c=${f.token_acceso.slice(0, 10)}`;
  const [acuseAbierto, setAcuseAbierto] = useState(null);
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
                  onClick={() => setQrAbierto(qrAbierto === f.id ? null : f.id)}
                  title="Ver código QR"
                  className="w-6 h-6 rounded-full bg-[#EDE0C8] text-[#2C2C2A] flex items-center justify-center flex-shrink-0"
                >
                  <IconQR />
                </button>
                {formatoWhatsApp(f.telefono) ? (
                  <a
                    href={`https://wa.me/${formatoWhatsApp(f.telefono)}?text=${encodeURIComponent(
                      `Hola ${f.nombre}! Para hacer tus cursos de capacitación entrá a este link: ${linkAcceso} y usá el PIN ${f.pin}.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Enviar por WhatsApp"
                    className="w-6 h-6 rounded-full bg-[#7C8B6F] text-white flex items-center justify-center flex-shrink-0"
                  >
                    <IconWhatsApp />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      alert(`${f.nombre} no tiene teléfono cargado. Agregalo desde Empleados para poder enviarle el link por WhatsApp.`)
                    }
                    title="Falta cargar el teléfono"
                    className="w-6 h-6 rounded-full bg-[#EDE0C8] text-[#a89f8a] flex items-center justify-center flex-shrink-0"
                  >
                    <IconWhatsApp />
                  </button>
                )}
              </div>
            )}
          </div>
          {f.ultimaActividad && (
            <p className="text-[10px] text-[#8a8471]">
              Última actividad: {new Date(f.ultimaActividad).toLocaleDateString('es-AR')}
            </p>
          )}
          {f.intentosFallidos > 0 && (
            <p className="text-[10px] font-bold tracking-wide text-[#C1502E] mt-0.5">
              {f.intentosFallidos} intento{f.intentosFallidos === 1 ? '' : 's'} sin aprobar
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
            <div key={b.microcurso_id} className="relative">
              <div className="flex items-center justify-between gap-2">
                <CursoCompletadoFila titulo={b.titulo} />
                <div className="flex items-center gap-1.5 flex-shrink-0">
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
                    title="Descargar certificado"
                    className="w-6 h-6 rounded-full bg-[#6B655A] text-white flex items-center justify-center flex-shrink-0"
                  >
                    <IconCertificado width="11" height="11" />
                  </button>
                  {/* Acuse de recibido: solo aplica a Seguridad e Higiene
                      (confirmar-acuse graba progreso_empleado.acuse_confirmado_at).
                      El color del ícono ya dice el estado de un vistazo; al
                      tocarlo se abre el detalle con la fecha y hora. */}
                  {b.especial && (
                    <button
                      type="button"
                      onClick={() => setAcuseAbierto(acuseAbierto === b.microcurso_id ? null : b.microcurso_id)}
                      title="Ver acuse de recibido"
                      className={`w-6 h-6 rounded-full text-white flex items-center justify-center flex-shrink-0 ${
                        b.acuse_confirmado_at ? 'bg-[#7C8B6F]' : 'bg-[#C1502E]'
                      }`}
                    >
                      <IconActa />
                    </button>
                  )}
                </div>
              </div>
              {b.especial && acuseAbierto === b.microcurso_id && (
                <div
                  className="absolute right-0 top-full mt-1.5 z-10 bg-[#2C2C2A] text-white text-[11px] font-semibold px-3 py-2 rounded-lg whitespace-nowrap text-right"
                  style={{ boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}
                >
                  {b.acuse_confirmado_at ? (
                    <>
                      Acuse confirmado
                      <br />
                      {new Date(b.acuse_confirmado_at).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                      , {new Date(b.acuse_confirmado_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                    </>
                  ) : (
                    'Acuse de recibido pendiente'
                  )}
                </div>
              )}
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
      .select('id, nombre, puesto, negocio_id, fecha_alta, foto_url, token_acceso, pin, telefono')
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
        .select('empleado_id, microcurso_id, completado, fecha_completado, puntaje, acuse_confirmado_at')
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
            acuse_confirmado_at: p.acuse_confirmado_at,
          });
          conteoPorCurso[p.microcurso_id] = (conteoPorCurso[p.microcurso_id] || 0) + 1;
        }
      });
    }

    // Intentos de evaluación sin aprobar (tabla `intentos_evaluacion`,
    // nueva). Si la tabla todavía no existe porque no se corrió la
    // migración, el select da error y esto queda en 0 para todos sin
    // romper el resto de la pantalla.
    let intentosFallidosPorEmpleado = {};
    if (empleadoIds.length > 0) {
      const { data: intentosData, error: intentosError } = await supabase
        .from('intentos_evaluacion')
        .select('empleado_id, aprobado')
        .in('empleado_id', empleadoIds)
        .eq('aprobado', false);
      if (!intentosError) {
        (intentosData || []).forEach((it) => {
          intentosFallidosPorEmpleado[it.empleado_id] = (intentosFallidosPorEmpleado[it.empleado_id] || 0) + 1;
        });
      }
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
      intentosFallidos: intentosFallidosPorEmpleado[e.id] || 0,
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
  // "Más activo": se mide por PORCENTAJE de avance (completados sobre lo
  // que le corresponde a cada uno), no por cantidad absoluta — alguien con
  // 2 de 3 cursos (66%) viene más adelantado que alguien con 2 de 4 (50%),
  // aunque completó la misma cantidad. Bug real corregido acá: antes
  // comparaba `completados` a secas, así que a alguien con menos cursos
  // asignados pero mejor avance nunca le tocaba destacarse.
  // Solo se muestra a alguien si tiene ESTRICTAMENTE mejor porcentaje que
  // el resto. Si hay empate en el máximo, no se elige a nadie.
  function porcentajeAvance(f) {
    return f.totalCursos > 0 ? f.completados / f.totalCursos : 0;
  }
  const maxPorcentajeAvance = filas.length > 0 ? Math.max(...filas.map(porcentajeAvance)) : 0;
  const empatadosEnMax = filas.filter((f) => porcentajeAvance(f) === maxPorcentajeAvance);
  const masActivo = maxPorcentajeAvance > 0 && empatadosEnMax.length === 1 ? empatadosEnMax[0] : null;
  const hayEmpateActivo = maxPorcentajeAvance > 0 && empatadosEnMax.length > 1;
  const podio = [...filas]
    .filter((f) => f.completados > 0)
    .sort((a, b) => b.completados - a.completados);
  const sinArrancar = filas.filter((f) => f.completados === 0);

  // Estancados: arrancaron (tienen al menos 1 completado) pero no
  // terminaron todo lo que les corresponde, y hace más de 10 días que no
  // completan nada nuevo. Distinto de "sin arrancar" (nunca empezaron) y
  // de estar simplemente al día (ya completaron todo lo que le toca).
  // El corte de 10 días es un criterio razonable, no un dato que venga
  // de ningún lado — ajustalo si te parece mucho o poco.
  const DIAS_ESTANCADO = 10;
  const ahora = Date.now();
  const estancados = filas.filter((f) => {
    if (f.completados === 0 || f.completados >= f.totalCursos) return false;
    if (!f.ultimaActividad) return false;
    const diasSinActividad = (ahora - new Date(f.ultimaActividad).getTime()) / 86400000;
    return diasSinActividad > DIAS_ESTANCADO;
  });

  // Promedio de puntaje de evaluación de un empleado, sobre los cursos
  // que ya completó (null si todavía no completó ninguno).
  function promedioPuntaje(f) {
    const conPuntaje = f.badges.filter((b) => typeof b.puntaje === 'number');
    if (conPuntaje.length === 0) return null;
    return Math.round(conPuntaje.reduce((acc, b) => acc + b.puntaje, 0) / conPuntaje.length);
  }

  // Comparación entre sucursales: % promedio de avance (mismo cálculo
  // que porcentajeAvance por empleado) agrupado por negocio_id. Solo
  // tiene sentido mostrarla si hay más de una sucursal.
  const avancePorSucursal = (() => {
    const mapa = {};
    filas.forEach((f) => {
      const clave = f.negocio_id || 'sin-sucursal';
      if (!mapa[clave]) mapa[clave] = { nombre: f.negocioNombre, sumaAvance: 0, cantidad: 0 };
      mapa[clave].sumaAvance += porcentajeAvance(f);
      mapa[clave].cantidad += 1;
    });
    return Object.values(mapa)
      .map((s) => ({
        nombre: s.nombre,
        porcentaje: s.cantidad > 0 ? Math.round((s.sumaAvance / s.cantidad) * 100) : 0,
      }))
      .sort((a, b) => b.porcentaje - a.porcentaje);
  })();

  // Tiempo promedio de capacitación: días entre el alta y la fecha en
  // que terminaron TODO lo que les correspondía (su último curso
  // completado), promediado solo entre quienes ya llegaron al 100%. Un
  // empleado a mitad de camino no suma acá, porque todavía no tiene un
  // "tiempo total" real, solo un tiempo parcial.
  const tiempoOnboardingPromedio = (() => {
    const completos = filas.filter(
      (f) => f.totalCursos > 0 && f.completados >= f.totalCursos && f.ultimaActividad && f.fecha_alta
    );
    if (completos.length === 0) return null;
    const dias = completos.map(
      (f) => (new Date(f.ultimaActividad).getTime() - new Date(f.fecha_alta).getTime()) / 86400000
    );
    return Math.round(dias.reduce((a, b) => a + b, 0) / dias.length);
  })();

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="bg-white rounded-2xl border border-[#EFDDCE] p-5 h-full flex flex-col justify-center">
              {masActivo ? (
                <div className="flex items-center gap-3">
                  <AnilloProgreso pct={Math.round(porcentajeAvance(masActivo) * 100)} size={64} grosor={7} color="#7C8B6F">
                    <span className="text-[13px] font-bold text-[#2C2C2A]">
                      {Math.round(porcentajeAvance(masActivo) * 100)}%
                    </span>
                  </AnilloProgreso>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#2C2C2A] leading-tight truncate">{masActivo.nombre}</p>
                    <p className="text-[10.5px] font-bold tracking-wide text-[#8a8471] whitespace-nowrap">
                      {masActivo.completados} de {masActivo.totalCursos} curso{masActivo.totalCursos === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span
                    className="text-[9px] font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-2 py-1.5 flex-shrink-0 whitespace-nowrap"
                    style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                  >
                    MÁS ACTIVO
                  </span>
                </div>
              ) : hayEmpateActivo ? null : (
                <p className="text-sm text-[#8a8471] text-center">Todavía nadie</p>
              )}
            </div>
          </div>
        )}

        {podio.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-4">Ranking del equipo</h2>
            <div className="grid grid-cols-3 gap-3">
              {podio.map((f) => {
                const pct = f.totalCursos > 0 ? Math.round((f.completados / f.totalCursos) * 100) : 0;
                const prom = promedioPuntaje(f);
                return (
                  <div key={f.id} className="flex flex-col items-center gap-2 text-center">
                    <AnilloProgreso pct={pct}>{pct}%</AnilloProgreso>
                    <p className="text-xs font-semibold text-[#2C2C2A] truncate w-full">{f.nombre}</p>
                    <p className="text-[10.5px] font-bold tracking-wide text-[#8a8471]">
                      {f.completados} de {f.totalCursos} curso{f.totalCursos === 1 ? '' : 's'}
                    </p>
                    {prom !== null && (
                      <p className="text-[10px] font-bold tracking-wide text-[#7C8B6F]">Prom. evaluación: {prom}%</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {avancePorSucursal.length > 1 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-4">Avance por sucursal</h2>
            <div className="grid gap-x-3 gap-y-3 items-center" style={{ gridTemplateColumns: 'auto 1fr' }}>
              {avancePorSucursal.map((s) => (
                <Fragment key={s.nombre}>
                  <p className="text-[11.5px] font-semibold text-[#2C2C2A] leading-tight">{s.nombre}</p>
                  <div className="min-w-[80px] h-5 bg-[#EDE0C8] rounded-md overflow-hidden">
                    <div
                      className="h-full bg-[#7C8B6F] rounded-md flex items-center justify-end px-2"
                      style={{ width: `${Math.max(s.porcentaje, 20)}%` }}
                    >
                      <span className="text-[10px] font-bold text-white whitespace-nowrap">{s.porcentaje}%</span>
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        )}

        {tiempoOnboardingPromedio !== null && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-[#2C2C2A]">Tiempo promedio de capacitación</h2>
              <p className="text-xs text-[#8a8471] mt-0.5">Desde el alta hasta completar todo lo que le corresponde</p>
            </div>
            <p className="text-2xl font-bold text-[#7C8B6F] flex-shrink-0">
              {tiempoOnboardingPromedio} día{tiempoOnboardingPromedio === 1 ? '' : 's'}
            </p>
          </div>
        )}

        {cursosRanking.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-4">Cursos más realizados</h2>
            {/* Grid con UNA sola columna de nombres compartida entre todas
                las filas (en vez de que cada fila mida su propio ancho de
                texto) — así todas las barras arrancan del mismo punto,
                alineadas con el nombre más largo, y cada una respeta su
                propio % desde ahí.

                El bug real de por qué el número seguía cortado: con
                'auto 1fr', la columna del título crece para que el texto
                entre en una sola línea SIN límite — un título largo como
                "Manejo de Situaciones Difíciles con Clientes" empujaba esa
                columna a ser enorme, dejándole a la barra (1fr) un
                espacio real en píxeles muy chico, así que ni el 20% mínimo
                alcanzaba para mostrar "0/8" completo. Ahora la columna del
                título tiene un tope relativo al ancho disponible (45%, no
                un número fijo de píxeles) y trunca con "..." si no entra,
                así la barra siempre tiene al menos la mitad del espacio. */}
            <div className="grid gap-x-3 gap-y-3 items-center" style={{ gridTemplateColumns: 'minmax(0,45%) 1fr' }}>
              {cursosRanking.map((c) => {
                // % sobre el total de empleados (no sobre el curso más
                // hecho): dice algo real ("le falta a la mayoría"), no solo
                // relativo al primero del ranking.
                const porcentajeEquipo = filas.length > 0 ? Math.round((c.cantidad / filas.length) * 100) : 0;
                // Nombre abreviado (hasta los ":", sin incluirlos). Letra
                // más chica que el resto de la pantalla para que entre más
                // título antes de necesitar truncar.
                const nombreCorto = c.titulo && c.titulo.includes(':') ? c.titulo.split(':')[0] : c.titulo;
                return (
                  <Fragment key={c.microcurso_id}>
                    <p
                      title={nombreCorto}
                      className="text-[10.5px] font-semibold text-[#2C2C2A] truncate"
                    >
                      {nombreCorto}
                    </p>
                    <div className="min-w-[80px] h-5 bg-[#EDE0C8] rounded-md overflow-hidden">
                      <div
                        className="h-full bg-[#7C8B6F] rounded-md flex items-center justify-end px-2"
                        style={{ width: `${Math.max(porcentajeEquipo, 20)}%` }}
                      >
                        <span className="text-[10px] font-bold text-white whitespace-nowrap">
                          {c.cantidad}/{filas.length}
                        </span>
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}

        {estancados.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-1">Estancados ({estancados.length})</h2>
            <p className="text-xs text-[#8a8471] mb-3">
              Arrancaron pero hace más de {DIAS_ESTANCADO} días que no completan nada nuevo.
            </p>
            <div className="space-y-2">
              {estancados.map((f) => (
                <div key={f.id} className="flex items-center gap-3">
                  <Avatar e={f} size={26} />
                  <p className="text-sm font-semibold tracking-wide text-[#2C2C2A]">{f.nombre}</p>
                  <p className="text-xs text-[#8a8471]">
                    · {f.completados} de {f.totalCursos} curso{f.totalCursos === 1 ? '' : 's'}
                  </p>
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
                  <p className="text-sm font-semibold tracking-wide text-[#2C2C2A]">{f.nombre}</p>
                  <p className="text-xs font-semibold text-[#A2734C]">· {f.negocioNombre}</p>
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
            <h2 className="font-bold text-[#2C2C2A] text-[14.5px]">Acá activás los cursos de cada empleado</h2>
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
