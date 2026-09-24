import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import SuscripcionRequeridaModal from '../components/SuscripcionRequeridaModal';
import TrialBanner from '../components/TrialBanner';
import { tieneAccesoBase, puedeUsarIA, trialActivo } from '../lib/acceso';
import { TituloCursoInline, esCursoSeguridadEHigiene } from '../components/Badges';
import { capitalizarPrimeraLetra } from '../lib/texto';

// Mismo catálogo que usa Empleados.jsx para el campo "puesto" — se
// duplica acá porque son archivos separados sin un módulo compartido
// de constantes todavía. Si agregás un puesto nuevo al catálogo de
// Empleados.jsx, replicalo acá para que la asignación por puesto lo vea.
const PUESTOS_CATALOGO_BASE = [
  'Vendedor/a',
  'Cajero/a',
  'Encargado/a',
  'Estilista / Peluquero/a',
  'Manicura / Cosmetóloga',
  'Recepcionista',
  'Repositor/a',
  'Kiosquero/a',
  'Panadero/a',
];

function IconContenidoMini(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 4h6l2 2h8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function IconLapiz(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}

function IconBorrar(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function IconVarita(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m15 4 1.5 1.5M18.5 7.5 20 9M3 21l7-7M13 7l4 4M9 3v2M3 9h2M17 15v2M19 17h2" />
    </svg>
  );
}

function IconMicrofono(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

// Spinner del cartel de "procesando" (subida/transcripción en curso).
function IconSpinner(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" strokeWidth="3" strokeLinecap="round" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" />
    </svg>
  );
}

// Tope de duración de la grabación directa desde el navegador, para no
// terminar con archivos gigantes (Groq acepta hasta 25MB, el server de
// Inductoria corta en 10MB — 5 minutos de audio comprimido queda bien
// por debajo de eso).
const DURACION_MAX_GRABACION_SEG = 5 * 60;

// Mismos topes que extraer-texto-archivo: 10 MB en general, y para
// imágenes lo que acepta Anthropic (5 MB medidos en base64, o sea unos
// 3,75 MB del archivo real). Se chequea acá antes de subir para no hacer
// esperar al dueño y que después falle igual.
const TAMANO_MAX_ARCHIVO = 10 * 1024 * 1024;
const TAMANO_MAX_IMAGEN = Math.floor((5 * 1024 * 1024 * 3) / 4);

// Si un contenido sigue en "generando" después de esto, el proceso en el
// servidor se cortó (la generación normal tarda uno o dos minutos) y lo
// mostramos como fallido, con opción de reintentar o eliminar.
const LIMITE_GENERACION_MS = 10 * 60 * 1000;
const INTERVALO_CONSULTA_GENERACION_MS = 4000;

// supabase.functions.invoke devuelve data=null cuando la función responde
// con un error (4xx/5xx), y el mensaje real queda adentro de
// error.context. Esto lo rescata para mostrarle al dueño el motivo real
// (por ejemplo "El contenido es muy largo, dividilo en partes").
async function leerErrorFuncion(error, data, mensajePorDefecto) {
  if (data?.error) return { mensaje: data.error, detalle: data.detalle };
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === 'function') {
      const cuerpo = await ctx.json();
      if (cuerpo?.error) return { mensaje: cuerpo.error, detalle: cuerpo.detalle };
    }
  } catch {
    // sin cuerpo legible, usamos el mensaje por defecto
  }
  return { mensaje: mensajePorDefecto, detalle: null };
}

const ESTADO_INFO = {
  pendiente: { bg: '#6B655A', color: '#ffffff', label: 'Pendiente', nitida: true },
  aprobado: { bg: '#7C8B6F', color: '#ffffff', label: 'Aprobado', nitida: true },
  // "generando": la Edge Function ya devolvió la respuesta rápido y el
  // trabajo pesado (llamar a la IA, armar el curso) sigue en segundo
  // plano en el servidor. Ver procesar-contenido-index.ts.
  // 2026-09-07, a pedido de Roberto: el azul tampoco pegaba con el resto
  // de la paleta. Mismo dorado/crema que "Curso generado" (#FCF3DD /
  // #8a6d1f): tiene sentido que compartan color, ya que "Generando..." es
  // sencillamente el paso previo a "Curso generado" para el mismo
  // contenido.
  generando: { bg: '#FCF3DD', color: '#8a6d1f', label: 'Generando...' },
  // Estado solo visual: quedó en "generando" más de LIMITE_GENERACION_MS.
  fallido: { bg: '#C1502E', color: '#ffffff', label: 'Falló', nitida: true },
  // 2026-09-07, a pedido de Roberto: el violeta no pega con el resto de
  // la paleta (terracota, verde salvia, marrón oliva, crema). Usamos el
  // mismo dorado/crema que ya usa "preguntas frecuentes" (#FCF3DD /
  // #8a6d1f), con el mismo peso visual que "Generando..." — bg clarito
  // + texto de color, sin fondo sólido, porque los dos son estados de
  // "todavía no es definitivo", a diferencia de Pendiente/Aprobado.
  procesado: { bg: '#FCF3DD', color: '#8a6d1f', label: 'Curso generado' },
};

// Lista desplegable de selección múltiple para "¿a qué puestos aplica
// este curso?", en reemplazo de la fila de botones/pills (con el
// catálogo creciendo por los puestos "Otro" que van cargando los
// dueños, la fila de pills se hacía ilegible). Primera opción siempre
// "Todos los puestos".
function SelectorPuestos({ seleccionados, onChange, disabled }) {
  return (
    <select
      multiple
      value={seleccionados}
      onChange={onChange}
      disabled={disabled}
      size={Math.min(PUESTOS_CATALOGO_BASE.length + 1, 6)}
      className="w-full border border-[#EFDDCE] rounded-lg text-sm outline-none px-1 py-1 disabled:opacity-60"
    >
      <option value="TODOS">Todos los puestos</option>
      {PUESTOS_CATALOGO_BASE.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );
}

// Maneja la selección múltiple nativa del <select>, manteniendo la
// misma regla de negocio que tenían los botones: "Todos los puestos"
// es excluyente con puestos puntuales. Si el dueño tilda "Todos"
// mientras ya tenía puestos puntuales elegidos, gana "Todos" (pisa el
// resto); si tenía "Todos" tildado y ahora además tilda un puesto
// puntual, se entiende que quiere pasar a puntual y se destilda "Todos".
function manejarSeleccionPuestos(setPuestos) {
  return (e) => {
    const nuevos = Array.from(e.target.selectedOptions, (o) => o.value);
    setPuestos((prev) => {
      const todosPrev = prev.includes('TODOS');
      const todosNuevo = nuevos.includes('TODOS');
      if (todosNuevo && !todosPrev) return ['TODOS'];
      if (todosNuevo && todosPrev) {
        const especificos = nuevos.filter((p) => p !== 'TODOS');
        return especificos.length > 0 ? especificos : ['TODOS'];
      }
      return nuevos;
    });
  };
}

export default function Contenido({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [contenidos, setContenidos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState(null);
  const [extrayendoArchivo, setExtrayendoArchivo] = useState(false);
  // Qué se está procesando ahora mismo, solo para elegir el texto del
  // cartel de "procesando" ('audio' = transcripción, 'archivo' = PDF/
  // docx/imagen). null cuando no hay nada en curso.
  const [tipoProcesando, setTipoProcesando] = useState(null);

  // Grabación de audio directo desde el navegador (alternativa a subir
  // un archivo ya grabado). audioGrabado guarda { blob, url } una vez
  // que se detiene la grabación, listo para escuchar antes de mandarlo.
  const [grabando, setGrabando] = useState(false);
  const [audioGrabado, setAudioGrabado] = useState(null);
  const [segundosGrabados, setSegundosGrabados] = useState(0);
  const [errorGrabacion, setErrorGrabacion] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksGrabacionRef = useRef([]);
  const streamGrabacionRef = useRef(null);
  const timerGrabacionRef = useRef(null);
  // Mantiene la pantalla del celular prendida mientras se graba. Sin esto,
  // en Android el navegador puede atenuar/cortar el micrófono si la
  // pantalla se apaga o se bloquea a mitad de la grabación, y el audio
  // resultante queda incompleto (solo un pedacito, aunque el timer haya
  // seguido contando normal).
  const wakeLockRef = useRef(null);
  // Hora real (Date.now(), no un contador de setInterval) en que arrancó
  // la grabación. En Android el navegador pausa los setInterval cuando la
  // pestaña queda en segundo plano, pero el micrófono sigue grabando: si
  // solo contáramos "ticks" del timer, el corte de seguridad de 5 minutos
  // nunca dispara a tiempo y queda grabando de más en silencio. Con la
  // hora real, el tiempo transcurrido siempre es el correcto apenas la
  // pestaña vuelve a primer plano.
  const grabacionInicioRef = useRef(null);

  const [cursosBase, setCursosBase] = useState([]);
  const [agregandoBaseId, setAgregandoBaseId] = useState(null);
  const [seleccionandoBaseId, setSeleccionandoBaseId] = useState(null);
  const [puestosBiblioteca, setPuestosBiblioteca] = useState([]);

  const [cursosPublicados, setCursosPublicados] = useState([]);
  const [gapsPorCurso, setGapsPorCurso] = useState({});
  const [gapAbiertoId, setGapAbiertoId] = useState(null);

  // Cursos propios en revisión por un cambio de contenido (2026-09-06,
  // ver handleActualizarPublicado y handlePublicarRevision más abajo).
  const [cursosEnRevision, setCursosEnRevision] = useState([]);
  const [publicandoRevisionId, setPublicandoRevisionId] = useState(null);
  const [errorPublicar, setErrorPublicar] = useState(null); // { id, mensaje }

  const [abiertoId, setAbiertoId] = useState(null);
  const [tituloEdit, setTituloEdit] = useState('');
  const [textoEdit, setTextoEdit] = useState('');
  const [guardandoEdit, setGuardandoEdit] = useState(false);

  // Generación con IA: puede haber varios contenidos generándose a la
  // vez, así que llevamos un conjunto de ids (antes era un solo
  // generandoId compartido, y generar un segundo contenido pisaba el
  // estado del primero).
  const [generandoIds, setGenerandoIds] = useState(() => new Set());
  // Ids que quedaron trabados en "generando" (ver LIMITE_GENERACION_MS).
  const [trabadosIds, setTrabadosIds] = useState(() => new Set());
  const trabadosRef = useRef(new Set());
  // Un solo poller por contenido: cargarTodo y handleGenerarCurso los
  // arrancaban los dos y quedaban consultas duplicadas.
  const pollersRef = useRef(new Set());
  const montadoRef = useRef(true);
  // Valor actual de abiertoId para usar desde el poller (que vive varios
  // renders y vería un valor viejo si lo leyera del closure).
  const abiertoIdRef = useRef(null);
  const cargoUnaVezRef = useRef(false);
  const [errorGenerar, setErrorGenerar] = useState(null); // { id, mensaje }
  const [errorItem, setErrorItem] = useState(null); // { id, mensaje }
  const [errorCarga, setErrorCarga] = useState(null);
  const [errorSubir, setErrorSubir] = useState(null);
  const [errorBase, setErrorBase] = useState(null); // { id, mensaje }
  const [errorAprobar, setErrorAprobar] = useState(null);
  const [errorPuestos, setErrorPuestos] = useState(null);
  const [okActualizar, setOkActualizar] = useState(null);

  const [borrador, setBorrador] = useState(null); // { microcurso, pasos }
  const [cargandoBorrador, setCargandoBorrador] = useState(false);
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const [puestosNuevoCurso, setPuestosNuevoCurso] = useState([]);

  const [mostrarSuscripcion, setMostrarSuscripcion] = useState(false);
  const [varianteSuscripcion, setVarianteSuscripcion] = useState('general');

  // Actualizar contenido de un curso ya publicado, sin borrar el microcurso.
  const [editandoPublicadoId, setEditandoPublicadoId] = useState(null);
  const [textoNuevoPublicado, setTextoNuevoPublicado] = useState('');
  const [actualizandoId, setActualizandoId] = useState(null);
  const [errorActualizar, setErrorActualizar] = useState(null);
  // Contenido actual (pasos + preguntas) del curso que se está editando,
  // para mostrárselo al dueño mientras escribe qué modificar o agregar
  // (2026-09-07, a pedido de Roberto: antes el cuadro de texto aparecía
  // vacío y no se entendía bien qué se estaba cambiando). Se carga recién
  // al confirmar "Cambiar versión", y el panel de edición en sí se
  // muestra más arriba, en "Contenido cargado", no acá adentro.
  const [contenidoActualEditando, setContenidoActualEditando] = useState(null);
  const [cargandoContenidoActual, setCargandoContenidoActual] = useState(false);

  // Asignación por puesto de un curso ya publicado.
  const [editandoPuestosId, setEditandoPuestosId] = useState(null);
  const [puestosSeleccionados, setPuestosSeleccionados] = useState([]);
  const [guardandoPuestos, setGuardandoPuestos] = useState(false);

  // En "Cursos disponibles", los botones de acción quedan ocultos detrás
  // de un lápiz hasta que el dueño confirma que quiere tocar un curso ya
  // aprobado (para no dejarlos siempre a la vista).
  const [accionesVisiblesId, setAccionesVisiblesId] = useState(null);

  // Confirmaciones propias, con el mismo look que ya usás en Dashboard.jsx
  // para agregar una sucursal (cartel color crema, botones Cancelar/Sí
  // continuar), en vez del cuadro de diálogo nativo del navegador
  // (`window.confirm`/`confirm`), que sale con letra negra estándar del
  // sistema operativo y no se puede pintar con los colores de la app.
  // 2026-09-06, a pedido de Roberto: reemplaza los 4 confirm() que tenía
  // esta pantalla.
  const [confirmandoAccionesId, setConfirmandoAccionesId] = useState(null);
  const [confirmandoEliminarId, setConfirmandoEliminarId] = useState(null);
  // 2026-09-07, a pedido de Roberto: si borrar un contenido falla (RLS,
  // alguna referencia que lo bloquea, conexión), antes esto quedaba en
  // silencio — el cartel de confirmación se cerraba igual y el contenido
  // parecía "borrado" aunque seguía ahí, reapareciendo en la próxima
  // recarga como si nunca se hubiera tocado.
  const [errorEliminar, setErrorEliminar] = useState(null);
  const [confirmandoDescartar, setConfirmandoDescartar] = useState(false);
  // 2026-09-07: si "Descartar" se niega a borrar porque el curso
  // enlazado ya está publicado (ver handleDescartarCurso), esto explica
  // por qué en vez de fallar en silencio o borrar igual.
  const [errorDescartar, setErrorDescartar] = useState(null);
  // 2026-09-07: cuando "Descartar" queda bloqueado porque el curso
  // enlazado ya está publicado o en revisión (ver handleDescartarCurso),
  // el contenido de texto original (como "Caja") quedaba de todos modos
  // atascado para siempre en "Contenido cargado", sin ninguna acción
  // posible. Esto agrega una salida distinta: borra SOLO la fila de
  // "contenidos" (el texto que se subió originalmente), nunca el
  // microcurso ni sus pasos/preguntas, así que el curso publicado y el
  // historial de empleados no se tocan.
  const [confirmandoQuitarVinculado, setConfirmandoQuitarVinculado] = useState(false);
  const [confirmandoVersionId, setConfirmandoVersionId] = useState(null);
  // Si el cambio de estado a "en_revision" falla (permisos, conexión,
  // etc.), lo mostramos acá en vez de fallar en silencio — antes, si
  // esto fallaba, el cartel de confirmación se cerraba solo y el curso
  // nunca se movía a "Contenido cargado", sin ninguna pista de qué pasó.
  const [errorCambiarVersion, setErrorCambiarVersion] = useState(null);

  function abrirAccionesPublicado(microcursoId) {
    setConfirmandoAccionesId(microcursoId);
  }

  useEffect(() => {
    montadoRef.current = true;
    cargarTodo();
    return () => {
      // Corta los pollers si el dueño se va de la pantalla.
      montadoRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    abiertoIdRef.current = abiertoId;
  }, [abiertoId]);

  // Si el dueño se va de la pantalla mientras está grabando (cambia de
  // pestaña, navega a otro lado), cortamos el micrófono y el timer en
  // vez de dejarlos prendidos en segundo plano.
  useEffect(() => {
    return () => {
      if (timerGrabacionRef.current) clearInterval(timerGrabacionRef.current);
      if (streamGrabacionRef.current) streamGrabacionRef.current.getTracks().forEach((t) => t.stop());
      if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
    };
  }, []);

  // El wake lock se libera solo cuando la pestaña pasa a segundo plano
  // (el navegador no lo reactiva por su cuenta). Si el dueño vuelve a la
  // pestaña mientras sigue grabando, lo volvemos a pedir.
  useEffect(() => {
    if (!grabando) return;
    function reactivarWakeLock() {
      if (document.visibilityState === 'visible' && grabando && 'wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then((wl) => {
          wakeLockRef.current = wl;
        }).catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', reactivarWakeLock);
    return () => document.removeEventListener('visibilitychange', reactivarWakeLock);
  }, [grabando]);

  // Si la pestaña pasa a segundo plano mientras se está grabando (el
  // dueño cambia de app, atiende el teléfono, se le bloquea la pantalla
  // pese al wake lock), cortamos la grabación ahí mismo en vez de dejarla
  // seguir. Esto es lo que causaba archivos con minutos de silencio real
  // y solo un pedacito de voz real: el micrófono no se pausa en segundo
  // plano aunque el timer de la pantalla sí, así que sin este corte queda
  // grabando de más sin que nadie se dé cuenta. Lo que ya se grabó hasta
  // este punto queda disponible para escuchar y usar como siempre.
  useEffect(() => {
    if (!grabando) return;
    function cortarSiSeVaAFondo() {
      if (document.visibilityState === 'hidden') {
        detenerGrabacion();
      }
    }
    document.addEventListener('visibilitychange', cortarSiSeVaAFondo);
    return () => document.removeEventListener('visibilitychange', cortarSiSeVaAFondo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabando]);

  // Solo la primera carga muestra "Cargando..." a pantalla completa. Las
  // recargas posteriores (después de generar, publicar, etc.) actualizan
  // los datos sin tapar la pantalla ni perder lo que el dueño tiene abierto.
  async function cargarTodo() {
    if (!cargoUnaVezRef.current) setLoading(true);
    setErrorCarga(null);
    const { data: cuentaData, error: cuentaError } = await supabase
      .from('cuentas')
      .select('*')
      .eq('owner_id', session.user.id)
      .maybeSingle();
    if (cuentaError) {
      console.error(cuentaError);
      setErrorCarga('No pudimos cargar tus datos. Revisá la conexión y probá de nuevo.');
      setLoading(false);
      return;
    }
    setCuenta(cuentaData);

    if (cuentaData) {
      const { data: publicadosData, error: publicadosError } = await supabase
        .from('microcursos')
        .select('id, titulo, created_at, puestos_aplicables, origen_base_id, version')
        .eq('cuenta_id', cuentaData.id)
        .eq('estado', 'aprobado')
        .order('created_at', { ascending: false });
      if (publicadosError) console.error(publicadosError);
      if (!publicadosError) setCursosPublicados(publicadosData || []);

      // Cursos propios a los que se les cambió el contenido (ver
      // handleActualizarPublicado): dejan de estar "aprobado" mientras se
      // revisa la versión nueva, así que no aparecen en "Cursos
      // disponibles" ni los ven los empleados hasta que el dueño confirma
      // la publicación desde acá abajo. select('*') para leer
      // revision_con_cambios sin romper si esa columna todavía no existe.
      const { data: revisionData, error: revisionError } = await supabase
        .from('microcursos')
        .select('*')
        .eq('cuenta_id', cuentaData.id)
        .eq('estado', 'en_revision')
        .order('created_at', { ascending: false });
      if (revisionError) console.error(revisionError);
      if (!revisionError) setCursosEnRevision(revisionData || []);

      const idsPublicados = new Set((publicadosData || []).map((m) => m.id));

      const { data: contenidosData, error: contenidosError } = await supabase
        .from('contenidos')
        .select('*')
        .eq('cuenta_id', cuentaData.id)
        .order('created_at', { ascending: false });
      if (contenidosError || publicadosError || revisionError) {
        if (contenidosError) console.error(contenidosError);
        setErrorCarga('No pudimos cargar todo tu contenido. Revisá la conexión y probá de nuevo.');
      }

      // Los contenidos cuyo curso ya quedó publicado (aprobado) salen de la
      // lista editable: ya están en "Cursos disponibles para tus empleados",
      // de solo lectura.
      // Si la consulta falló no pisamos la lista que ya se veía.
      if (!contenidosError && !publicadosError) {
        setContenidos((contenidosData || []).filter((c) => !(c.microcurso_id && idsPublicados.has(c.microcurso_id))));
      }

      // Si algún contenido quedó en "generando" (por ejemplo porque se
      // arrancó la generación y se cerró la pestaña), el trabajo real
      // puede seguir corriendo en el servidor. Retomamos la consulta
      // periódica acá (esperarResultadoGeneracion ignora los que ya tienen
      // un poller andando), salvo que ya haya pasado el límite: esos se
      // muestran directamente como fallidos.
      (contenidosData || [])
        .filter((c) => c.estado === 'generando')
        .forEach((c) => {
          if (generacionVencida(c)) marcarTrabado(c.id);
          else esperarResultadoGeneracion(c.id, c.generando_desde);
        });

      supabase.functions.invoke('gaps-conocimiento', { method: 'GET' }).then(({ data, error }) => {
        // No es crítico: si falla, simplemente no se muestran las
        // preguntas frecuentes.
        if (error || !data?.gaps) return;
        const mapa = {};
        data.gaps.forEach((g) => (mapa[g.microcurso_id] = g));
        setGapsPorCurso(mapa);
      });
    }

    const { data: baseData, error: baseError } = await supabase
      .from('cursos_base')
      .select('*')
      .order('orden', { ascending: true });
    if (baseError) console.error(baseError);
    setCursosBase(baseData || []);

    cargoUnaVezRef.current = true;
    setLoading(false);
  }

  function generacionVencida(c) {
    if (!c.generando_desde) return false;
    const desde = new Date(c.generando_desde).getTime();
    return Number.isFinite(desde) && Date.now() - desde > LIMITE_GENERACION_MS;
  }

  function marcarTrabado(id) {
    trabadosRef.current.add(id);
    setTrabadosIds(new Set(trabadosRef.current));
  }

  function desmarcarTrabado(id) {
    trabadosRef.current.delete(id);
    setTrabadosIds(new Set(trabadosRef.current));
  }

  function estaTrabado(c) {
    return c.estado === 'generando' && (trabadosIds.has(c.id) || generacionVencida(c));
  }

  function abrirSeleccionBase(cursoId) {
    if (seleccionandoBaseId === cursoId) {
      setSeleccionandoBaseId(null);
      return;
    }
    setSeleccionandoBaseId(cursoId);
    setPuestosBiblioteca([]);
  }

  async function handleAgregarBase(curso) {
    if (!hasAccess) {
      setVarianteSuscripcion('general');
      setMostrarSuscripcion(true);
      return;
    }

    // Seguridad e Higiene es obligatorio para todos los puestos siempre
    // (a pedido de Roberto, 2026-09-06): se agrega directo con
    // puestos_aplicables=['TODOS'], sin pasar por el selector de puestos
    // ni permitir elegir otra cosa. Los demás cursos de biblioteca sí
    // requieren elegir puesto antes de agregarse, como ya funcionaba.
    const esSegHig = esCursoSeguridadEHigiene(curso.titulo);
    const puestosAAsignar = esSegHig ? ['TODOS'] : puestosBiblioteca;
    if (!esSegHig && puestosBiblioteca.length === 0) return;

    setAgregandoBaseId(curso.id);
    setErrorBase(null);

    // Los cursos de biblioteca ya vienen armados (pasos y preguntas
    // redactados a mano), así que se publican directo, sin pasar por
    // texto→aprobar→generar con IA como el resto del contenido.
    // origen_base_id queda guardado para saber que este curso viene de la
    // biblioteca (2026-09-06): a estos el dueño no les puede tocar el
    // contenido, solo (salvo Seguridad e Higiene) los puestos.
    const { data: microcurso, error } = await supabase
      .from('microcursos')
      .insert({
        cuenta_id: cuenta.id,
        titulo: curso.titulo,
        duracion_min: curso.duracion_min || 14,
        estado: 'aprobado',
        preguntas: curso.preguntas || [],
        puestos_aplicables: puestosAAsignar,
        origen_base_id: curso.id,
      })
      .select()
      .single();

    if (error || !microcurso) {
      console.error(error);
      setAgregandoBaseId(null);
      setErrorBase({ id: curso.id, mensaje: 'No se pudo agregar el curso. Probá de nuevo.' });
      return;
    }

    const pasosAInsertar = (curso.pasos || []).map((p) => ({
      microcurso_id: microcurso.id,
      orden: p.orden,
      titulo: p.titulo,
      contenido: p.contenido,
    }));
    if (pasosAInsertar.length > 0) {
      const { error: pasosError } = await supabase.from('pasos').insert(pasosAInsertar);
      if (pasosError) {
        // Sin pasos el curso quedaría publicado pero vacío para los
        // empleados: lo sacamos y avisamos.
        console.error(pasosError);
        await supabase.from('microcursos').delete().eq('id', microcurso.id);
        setAgregandoBaseId(null);
        setErrorBase({ id: curso.id, mensaje: 'No se pudo agregar el curso completo. Probá de nuevo.' });
        return;
      }
    }

    setAgregandoBaseId(null);
    setSeleccionandoBaseId(null);
    setPuestosBiblioteca([]);
    setCursosPublicados([microcurso, ...cursosPublicados]);
  }

  async function handleSubir(e) {
    e.preventDefault();
    if (!titulo.trim() || !texto.trim()) return;

    if (!hasAccess) {
      setVarianteSuscripcion('general');
      setMostrarSuscripcion(true);
      return;
    }

    setSubiendo(true);
    setErrorSubir(null);

    const { data, error } = await supabase
      .from('contenidos')
      .insert({
        cuenta_id: cuenta.id,
        tipo: 'texto',
        archivo_original: capitalizarPrimeraLetra(titulo.trim()),
        texto_procesado: texto.trim(),
        estado: 'pendiente',
      })
      .select()
      .single();

    setSubiendo(false);
    if (error) {
      console.error(error);
      setErrorSubir('No se pudo guardar el contenido. Probá de nuevo.');
      return;
    }
    setContenidos([data, ...contenidos]);
    setTitulo('');
    setTexto('');
  }

  // esGrabacionPropia: true cuando el audio viene de grabar acá mismo
  // (usarGrabacion). Esos archivos siempre se llaman "grabacion-<hora>.ext"
  // porque el nombre lo inventamos nosotros, así que no sirve como título
  // (era justamente lo que estaba apareciendo arriba del contenido). Un
  // audio o archivo subido por el dueño sí puede traer un nombre real, ahí
  // sigue teniendo sentido usarlo para completar el título.
  function handleArchivo(file, duracionSegConocida, esGrabacionPropia) {
    if (!file) return;
    setErrorArchivo(null);

    const nombreLower = file.name.toLowerCase();
    const esTxt = file.type === 'text/plain' || nombreLower.endsWith('.txt');
    const esPdf = file.type === 'application/pdf' || nombreLower.endsWith('.pdf');
    const esDocx =
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      nombreLower.endsWith('.docx');
    const esImagen =
      ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type) ||
      /\.(png|jpe?g|webp)$/.test(nombreLower);
    const esAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|webm|opus)$/.test(nombreLower);

    if (!esTxt && !esPdf && !esDocx && !esImagen && !esAudio) {
      setErrorArchivo('Solo se aceptan archivos .txt, .pdf, .docx, imágenes o audio. Video no está soportado.');
      return;
    }

    if (file.size > TAMANO_MAX_ARCHIVO) {
      setErrorArchivo('El archivo pesa más de 10 MB. Probá con uno más liviano o dividilo en partes.');
      return;
    }
    if (esImagen && file.size > TAMANO_MAX_IMAGEN) {
      setErrorArchivo('La imagen pesa demasiado (el máximo es de unos 3,5 MB). Probá con una captura o una foto más liviana.');
      return;
    }

    // Leer imágenes usa Claude vision (costo real) — no disponible en
    // trial, igual que generar el curso. .txt/.pdf/.docx se extraen con
    // librerías comunes (unpdf/mammoth), sin costo de IA. El audio se
    // transcribe con Groq, que es gratis, así que desde 2026-08-17
    // también está disponible en trial (deja ver el flujo completo
    // "subir/grabar audio → texto" antes de suscribirse — lo único que
    // sigue bloqueado es el paso siguiente, generar el curso con IA).
    if (esImagen && !puedeUsarIA(cuenta, session.user.email)) {
      setVarianteSuscripcion('ia');
      setMostrarSuscripcion(true);
      return;
    }

    if (esTxt) {
      const lector = new FileReader();
      lector.onload = (e) => {
        setTexto(e.target.result);
        if (!titulo.trim()) {
          setTitulo(file.name.replace(/\.txt$/i, ''));
        }
      };
      lector.onerror = () => setErrorArchivo('No se pudo leer el archivo. Probá de nuevo.');
      lector.readAsText(file);
      return;
    }

    // PDF, .docx, imagen o audio pasan por el servidor para extraer el
    // texto. Usamos fetch directo en vez de supabase.functions.invoke:
    // el SDK de supabase-js devuelve data=null en cualquier respuesta que
    // no sea 2xx, así que el mensaje de error real que manda la función
    // (por ejemplo, por qué Groq no pudo transcribir un audio puntual) se
    // perdía y siempre se veía el mismo mensaje genérico. Con fetch
    // directo, siempre leemos el cuerpo real de la respuesta, haya salido
    // bien o mal.
    setTipoProcesando(esAudio ? 'audio' : 'archivo');
    setExtrayendoArchivo(true);
    const lectorBinario = new FileReader();
    lectorBinario.onload = async (e) => {
      const base64 = e.target.result.split(',')[1]; // saca el prefijo data:...;base64,
      const base = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // Antes, si el pedido quedaba colgado (por ejemplo la pantalla del
      // celular se bloquea a mitad de la espera y el navegador pausa todo
      // en segundo plano hasta que se vuelve a desbloquear), el cartel de
      // "procesando" quedaba así varios minutos sin ninguna pista de qué
      // estaba pasando. Cortamos acá mismo a los 130 segundos (un poco
      // antes de que Supabase corte solo a los 150 y devuelva un 504 sin
      // explicación) para que, si esto pasa, al menos se vea un mensaje
      // claro de que se cortó por tardar de más, en vez de un 504 pelado.
      const controlador = new AbortController();
      const timeoutId = setTimeout(() => controlador.abort(), 130000);

      try {
        const res = await fetch(`${base}/functions/v1/extraer-texto-archivo`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: anonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            archivo_base64: base64,
            nombre_archivo: file.name,
            tipo: file.type,
            // Solo se manda cuando el audio se grabó acá mismo (ver
            // usarGrabacion): es la duración real medida por el
            // navegador mientras grababa, para el contador de tiempo
            // del panel de admin.
            ...(duracionSegConocida ? { duracion_seg: duracionSegConocida } : {}),
          }),
          signal: controlador.signal,
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || data?.error) {
          const mensajeBase = data?.error || `No se pudo extraer el texto del archivo (error ${res.status}).`;
          // data.detalle trae el error real de Groq (o del servidor), antes
          // se perdía y solo quedaba registrado en los logs de Supabase. Lo
          // mostramos acá para no tener que ir a buscar el log cada vez.
          setErrorArchivo(data?.detalle ? `${mensajeBase} (${data.detalle})` : mensajeBase);
          return;
        }

        setTexto(data.texto);
        if (!titulo.trim() && !esGrabacionPropia) {
          setTitulo(file.name.replace(/\.(pdf|docx|mp3|wav|m4a|ogg|webm|opus|mp4)$/i, ''));
        }
      } catch (err) {
        console.error(err);
        if (err?.name === 'AbortError') {
          setErrorArchivo('El servidor tardó demasiado en responder (más de 2 minutos). Probá de nuevo con mejor conexión, o con un audio más corto.');
        } else {
          setErrorArchivo('No se pudo conectar con el servidor. Probá de nuevo.');
        }
      } finally {
        clearTimeout(timeoutId);
        setExtrayendoArchivo(false);
        setTipoProcesando(null);
      }
    };
    lectorBinario.onerror = () => {
      setExtrayendoArchivo(false);
      setTipoProcesando(null);
      setErrorArchivo('No se pudo leer el archivo. Probá de nuevo.');
    };
    lectorBinario.readAsDataURL(file);
  }

  // Graba audio directo desde el micrófono del navegador, como
  // alternativa a subir un archivo ya grabado. Una vez detenida la
  // grabación, se puede escuchar y, si sirve, se manda por el MISMO
  // camino que un archivo de audio subido (handleArchivo), reusando
  // toda la lógica que ya existe: el envío a extraer-texto-archivo, etc.
  // Sin bloqueo de trial acá — igual que subir un audio ya grabado,
  // transcribir con Groq es gratis y está disponible en trial (ver
  // handleArchivo más arriba).
  function elegirMimeTypeGrabacion() {
    if (typeof MediaRecorder === 'undefined') return '';
    // Volvimos al orden original (webm primero): confirmamos con un
    // archivo real que el problema NO es el contenedor (webm vs mp4),
    // pasaba igual con los dos. La causa real era otra (ver
    // iniciarGrabacion/visibilitychange más abajo), así que nos quedamos
    // con el camino más probado en Chrome en vez de sumar mp4 sin motivo.
    const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    return candidatos.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
  }

  // Encontrado revisando esto de nuevo: usarGrabacion y
  // compartirGrabacionDebug solo sabían poner extensión ".mp4" o ".webm"
  // (miraban si el mimeType incluía "mp4", y si no, asumían webm siempre).
  // Firefox en Android puede grabar en "audio/ogg" en vez de webm, y ahí
  // el archivo terminaba mandado como "grabacion-....webm" con contenido
  // Ogg real adentro. El navegador manda el Content-Type correcto en el Blob,
  // pero Groq (como la mayoría de las APIs tipo Whisper) elige el decoder
  // por la EXTENSIÓN del nombre de archivo, no por el Content-Type del
  // multipart. Un .webm que en realidad es Ogg se intenta decodificar como
  // el contenedor equivocado: en el mejor caso sale una transcripción
  // basura ("transcribe cualquier cosa"), en el peor un error del server.
  // Esto explica por qué fallaba distinto en Chrome y Firefox aun siendo
  // el mismo bug: cada uno termina grabando en un contenedor distinto.
  function extensionParaMimeType(mimeType) {
    const m = (mimeType || '').toLowerCase();
    if (m.includes('mp4')) return 'mp4';
    if (m.includes('ogg')) return 'ogg';
    if (m.includes('webm')) return 'webm';
    return 'webm';
  }

  async function iniciarGrabacion() {
    setErrorGrabacion(null);

    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorGrabacion('Tu navegador no permite grabar audio acá. Probá subir un archivo de audio ya grabado.');
      return;
    }

    try {
      // Antes pedíamos { audio: true } a secas, que en el celular deja que
      // el navegador/OS aplique sus valores por defecto de cancelación de
      // eco, supresión de ruido y control automático de ganancia. En una
      // notebook esos filtros son livianos porque están pensados para
      // videollamadas de escritorio, pero en el micrófono de un celular
      // son mucho más agresivos (están pensados para llamadas telefónicas
      // con parlante, no para dictado de cerca): pueden recortar el
      // arranque de las palabras, meter "gating" en las partes suaves de
      // la voz o variar el volumen a mitad de frase. Whisper (que hace
      // Groq del otro lado) no tiene ese problema con ruido de fondo
      // normal, pero sí le cuesta mucho con audio ya procesado/recortado
      // así, y ante audio raro no siempre devuelve error: a veces
      // "alucina" texto que no tiene nada que ver, que es exactamente el
      // síntoma de "transcribe cualquier cosa" que se vio en Firefox.
      // Pedimos el audio lo más crudo posible y dejamos que Whisper se
      // encargue del ruido, que es para lo que está entrenado.
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            sampleRate: { ideal: 16000 },
          },
        });
      } catch (errConstraints) {
        // Algún celular/navegador raro podría rechazar estas constraints
        // puntuales (no debería, son todas "ideal" o booleanas, nunca
        // "exact", pero por las dudas no dejamos sin poder grabar por
        // esto). Reintentamos con el pedido genérico de antes.
        console.warn('getUserMedia con constraints específicas falló, reintentando genérico:', errConstraints);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamGrabacionRef.current = stream;

      // Evita que Android apague la pantalla y corte el micrófono a mitad
      // de la grabación. Si el navegador no lo soporta (Safari viejo,
      // etc.) seguimos igual, sin esto la grabación funciona pero corre
      // el riesgo de cortarse si la pantalla se apaga.
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (e) {
        console.warn('No se pudo activar el wake lock:', e);
      }

      const mimeType = elegirMimeTypeGrabacion();
      // Bitrate bajo a propósito: esto es una nota de voz hablada, no
      // música, y Whisper transcribe perfecto con mucho menos que el
      // default del navegador (que suele rondar 64-128kbps). Con 24kbps
      // el archivo pesa una fracción de lo que pesaba, así que en una
      // conexión lenta se sube en una fracción del tiempo.
      const opciones = { audioBitsPerSecond: 24000, ...(mimeType ? { mimeType } : {}) };
      const recorder = new MediaRecorder(stream, opciones);
      chunksGrabacionRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksGrabacionRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksGrabacionRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });
        setAudioGrabado({ blob, url: URL.createObjectURL(blob) });
        stream.getTracks().forEach((t) => t.stop());
        streamGrabacionRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      // El argumento (1000) hace que vaya entregando pedacitos de 1
      // segundo en vez de armar un solo bloque gigante al final. Sin esto,
      // confirmado con un archivo real: Chrome en Android arma bien el
      // audio pero le pone una duración mentirosa en la cabecera del
      // archivo (decía 3 minutos y pico en una grabación de 19 segundos
      // reales), y esa cabecera rota es lo que confunde a Groq al
      // transcribir. Grabando en pedacitos chicos, cada uno queda bien
      // formado y no pasa esto.
      recorder.start(1000);
      setGrabando(true);
      setSegundosGrabados(0);
      grabacionInicioRef.current = Date.now();

      timerGrabacionRef.current = setInterval(() => {
        const transcurridos = Math.floor((Date.now() - grabacionInicioRef.current) / 1000);
        setSegundosGrabados(transcurridos);
        if (transcurridos >= DURACION_MAX_GRABACION_SEG) {
          detenerGrabacion();
        }
      }, 1000);
    } catch (err) {
      console.error(err);
      setErrorGrabacion('No se pudo acceder al micrófono. Revisá los permisos del navegador para este sitio.');
    }
  }

  function detenerGrabacion() {
    if (timerGrabacionRef.current) {
      clearInterval(timerGrabacionRef.current);
      timerGrabacionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    setGrabando(false);
  }

  function descartarGrabacion() {
    if (audioGrabado?.url) URL.revokeObjectURL(audioGrabado.url);
    setAudioGrabado(null);
    setSegundosGrabados(0);
  }

  function usarGrabacion() {
    if (!audioGrabado) return;
    const extension = extensionParaMimeType(audioGrabado.blob.type);
    const archivo = new File([audioGrabado.blob], `grabacion-${Date.now()}.${extension}`, {
      type: audioGrabado.blob.type || 'audio/webm',
    });
    const url = audioGrabado.url;
    const duracionSeg = segundosGrabados; // guardarlo antes de resetear el contador
    setAudioGrabado(null);
    setSegundosGrabados(0);
    URL.revokeObjectURL(url);
    handleArchivo(archivo, duracionSeg, true);
  }

  function formatearDuracion(segundos) {
    const m = Math.floor(segundos / 60).toString().padStart(2, '0');
    const s = Math.floor(segundos % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function handleDrop(e) {
    e.preventDefault();
    setArrastrando(false);
    handleArchivo(e.dataTransfer.files?.[0]);
  }

  // Abre o cierra un contenido de la lista (toque sobre la tarjeta).
  function abrirItem(c) {
    if (abiertoId === c.id) {
      setAbiertoId(null);
      setBorrador(null);
      setPuestosNuevoCurso([]);
      return;
    }
    abrirContenido(c);
  }

  // Abre SIEMPRE (nunca cierra) un contenido y, si ya tiene un curso
  // generado, carga el borrador. Se separó de abrirItem porque el poller
  // llamaba a abrirItem con un abiertoId viejo del closure: si el dueño
  // tenía abierto ese mismo contenido, abrirItem lo interpretaba como un
  // segundo toque y cerraba el panel justo cuando terminaba de generarse.
  async function abrirContenido(c) {
    setAbiertoId(c.id);
    abiertoIdRef.current = c.id;
    setTituloEdit(c.archivo_original || '');
    setTextoEdit(c.texto_procesado || '');
    setErrorGenerar(null);
    setErrorItem(null);
    setErrorAprobar(null);
    setErrorDescartar(null);
    setConfirmandoQuitarVinculado(false);
    setBorrador(null);
    setPuestosNuevoCurso([]);

    if (c.estado === 'procesado' && c.microcurso_id) {
      setCargandoBorrador(true);
      const { data: microcurso } = await supabase
        .from('microcursos')
        .select('*')
        .eq('id', c.microcurso_id)
        .maybeSingle();

      let pasos = [];
      if (microcurso) {
        const { data } = await supabase
          .from('pasos')
          .select('*')
          .eq('microcurso_id', microcurso.id)
          .order('orden', { ascending: true });
        pasos = data || [];
      }
      // Si mientras cargaba el dueño abrió otro contenido, no pisamos lo
      // que está viendo.
      if (abiertoIdRef.current === c.id) {
        setBorrador(microcurso ? { microcurso, pasos } : null);
        setCargandoBorrador(false);
      }
    }
  }

  async function handleGuardarEdit(id) {
    if (!tituloEdit.trim() || !textoEdit.trim()) return;
    setGuardandoEdit(true);
    setErrorItem(null);
    const { data, error } = await supabase
      .from('contenidos')
      .update({ archivo_original: capitalizarPrimeraLetra(tituloEdit.trim()), texto_procesado: textoEdit.trim() })
      .eq('id', id)
      .select()
      .single();

    setGuardandoEdit(false);
    if (error) {
      console.error(error);
      setErrorItem({ id, mensaje: 'No se pudieron guardar los cambios. Probá de nuevo.' });
      return;
    }
    setContenidos(contenidos.map((c) => (c.id === id ? data : c)));
    setAbiertoId(null);
  }

  async function handleCambiarEstado(id, estadoActual) {
    const nuevoEstado = estadoActual === 'aprobado' ? 'pendiente' : 'aprobado';
    setErrorItem(null);
    const { data, error } = await supabase
      .from('contenidos')
      .update({ estado: nuevoEstado })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(error);
      setErrorItem({ id, mensaje: 'No se pudo cambiar el estado. Probá de nuevo.' });
      return;
    }
    setContenidos(contenidos.map((c) => (c.id === id ? data : c)));
  }

  async function handleEliminar(id) {
    setErrorEliminar(null);
    const { error } = await supabase.from('contenidos').delete().eq('id', id);
    if (error) {
      // No cerramos el cartel de confirmación: si esto fallara en
      // silencio (como pasaba antes), el contenido "borrado" en realidad
      // seguía ahí, y volvía a aparecer en la próxima recarga sin ningún
      // aviso de que el borrado nunca se hizo.
      console.error(error);
      setErrorEliminar('No se pudo eliminar. Probá de nuevo.');
      return;
    }
    setConfirmandoEliminarId(null);
    setContenidos(contenidos.filter((c) => c.id !== id));
    desmarcarTrabado(id);
    setAbiertoId(null);
  }

  // Rediseño 2026-08-26: procesar-contenido responde CASI AL INSTANTE
  // (marca el contenido como "generando" y devuelve), y el trabajo pesado
  // sigue en el SERVIDOR en segundo plano, independiente de si el celular
  // sigue conectado. El frontend solo pregunta cada pocos segundos "¿ya
  // terminó?" (esperarResultadoGeneracion).
  async function handleGenerarCurso(id) {
    if (!puedeUsarIA(cuenta, session.user.email)) {
      setVarianteSuscripcion('ia');
      setMostrarSuscripcion(true);
      return;
    }

    setGenerandoIds((prev) => new Set(prev).add(id));
    setErrorGenerar(null);

    try {
      const { data, error } = await supabase.functions.invoke('procesar-contenido', {
        method: 'POST',
        body: { contenido_id: id },
      });

      if (error || data?.error) {
        const { mensaje, detalle } = await leerErrorFuncion(
          error,
          data,
          'No se pudo iniciar la generación. Probá de nuevo.'
        );
        // Si el servidor manda un `detalle` (el motivo técnico exacto),
        // lo mostramos junto al mensaje para no tener que ir a buscar
        // logs de Supabase cada vez que algo falla acá.
        setErrorGenerar({ id, mensaje: detalle ? `${mensaje} (${detalle})` : mensaje });
        setGenerandoIds((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
        return;
      }
    } catch (err) {
      // Puede que no haya llegado a arrancar, o que la respuesta se haya
      // cortado justo al volver (y sí haya arrancado). En vez de asumir,
      // preguntamos el estado real con el poller de abajo.
      console.error(err);
    }
    // cargarTodo ya arranca el poller si lo ve en "generando"; la llamada
    // explícita cubre el caso en que todavía no se veía así. El poller
    // ignora la segunda llamada si ya hay uno andando.
    await cargarTodo();
    esperarResultadoGeneracion(id);
  }

  // Reintentar una generación que quedó trabada: la devolvemos a
  // "aprobado" (así procesar-contenido la acepta) y arrancamos de nuevo.
  async function handleReintentarGeneracion(c) {
    setErrorGenerar(null);
    const { error } = await supabase
      .from('contenidos')
      .update({ estado: 'aprobado', error_generacion: null })
      .eq('id', c.id);
    if (error) {
      console.error(error);
      setErrorGenerar({ id: c.id, mensaje: 'No se pudo reintentar. Probá de nuevo o eliminá el contenido.' });
      return;
    }
    desmarcarTrabado(c.id);
    await handleGenerarCurso(c.id);
  }

  // Consulta el estado real cada pocos segundos hasta que el contenido
  // deje de estar "generando" (pasó a "procesado" = éxito, o volvió a
  // "aprobado" = terminó con error). Hay UN solo poller por contenido
  // (pollersRef), y si pasa LIMITE_GENERACION_MS sin terminar se marca
  // como trabado para ofrecer reintentar o eliminar.
  async function esperarResultadoGeneracion(id, generandoDesde) {
    if (pollersRef.current.has(id)) return;
    pollersRef.current.add(id);
    setGenerandoIds((prev) => new Set(prev).add(id));

    let inicio = generandoDesde ? new Date(generandoDesde).getTime() : Date.now();
    if (!Number.isFinite(inicio)) inicio = Date.now();

    try {
      while (montadoRef.current) {
        if (Date.now() - inicio > LIMITE_GENERACION_MS) {
          marcarTrabado(id);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, INTERVALO_CONSULTA_GENERACION_MS));
        if (!montadoRef.current) return;

        const { data: actual, error } = await supabase
          .from('contenidos')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error) continue; // problema de red puntual, seguimos intentando
        if (!actual) return; // lo eliminaron mientras tanto

        if (actual.estado === 'procesado' && actual.microcurso_id) {
          await cargarTodo();
          // Abrimos el borrador si el dueño tenía abierto este contenido
          // o no tenía ninguno abierto. Si está mirando otro, no se lo
          // cambiamos de golpe: lo va a ver como "Curso generado".
          const abiertoAhora = abiertoIdRef.current;
          if (abiertoAhora === id || abiertoAhora === null) {
            await abrirContenido(actual);
          }
          return;
        }

        if (actual.estado !== 'generando') {
          // Volvió a "aprobado" sin quedar procesado: el trabajo en el
          // servidor terminó, pero con error (queda en error_generacion y
          // se muestra en la tarjeta).
          await cargarTodo();
          return;
        }

        if (actual.generando_desde) {
          const desde = new Date(actual.generando_desde).getTime();
          if (Number.isFinite(desde)) inicio = desde;
        }
      }
    } finally {
      pollersRef.current.delete(id);
      if (montadoRef.current) {
        setGenerandoIds((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
      }
    }
  }

  async function handleAprobarCurso() {
    if (!borrador) return;
    if (puestosNuevoCurso.length === 0) return;

    if (!hasAccess) {
      setVarianteSuscripcion('general');
      setMostrarSuscripcion(true);
      return;
    }

    setProcesandoAccion(true);
    setErrorAprobar(null);
    const { error } = await supabase
      .from('microcursos')
      .update({ estado: 'aprobado', puestos_aplicables: puestosNuevoCurso })
      .eq('id', borrador.microcurso.id);
    setProcesandoAccion(false);
    if (error) {
      // Antes no se miraba el error: el panel se cerraba igual y el curso
      // parecía publicado aunque no lo estaba.
      console.error(error);
      setErrorAprobar('No se pudo publicar el curso. Probá de nuevo.');
      return;
    }
    setAbiertoId(null);
    setBorrador(null);
    setPuestosNuevoCurso([]);
    cargarTodo();
  }

  async function handleDescartarCurso() {
    if (!borrador) return;

    // 2026-09-07: si el curso enlazado a este contenido YA está
    // publicado (o en medio de un cambio de versión), no lo borramos:
    // podría ser un curso real ya completado por empleados, no un simple
    // borrador.
    if (borrador.microcurso.estado === 'aprobado' || borrador.microcurso.estado === 'en_revision') {
      setConfirmandoDescartar(false);
      setErrorDescartar(
        'Este contenido ya generó un curso que está publicado (o en medio de un cambio de versión). No se puede descartar así para no perder ese curso ni el historial de tus empleados. Para modificarlo, usá "Cambiar versión" desde Cursos disponibles.'
      );
      return;
    }

    setConfirmandoDescartar(false);
    setProcesandoAccion(true);
    const { error: borrarError } = await supabase.from('microcursos').delete().eq('id', borrador.microcurso.id);
    if (borrarError) {
      console.error(borrarError);
      setProcesandoAccion(false);
      setErrorDescartar('No se pudo descartar el curso. Probá de nuevo.');
      return;
    }
    const { error: contenidoError } = await supabase
      .from('contenidos')
      .update({ estado: 'aprobado', microcurso_id: null })
      .eq('id', abiertoId);
    setProcesandoAccion(false);
    if (contenidoError) {
      console.error(contenidoError);
      setErrorDescartar('El curso se descartó, pero no se pudo actualizar el contenido. Recargá la página.');
      return;
    }
    setAbiertoId(null);
    setBorrador(null);
    cargarTodo();
  }

  // Borra ÚNICAMENTE la fila de "contenidos" (el texto original que se
  // subió), sin tocar para nada el microcurso al que está enlazado. Es la
  // salida para el caso en que "Descartar" queda bloqueado (arriba): el
  // curso real, sus pasos/preguntas y el historial de empleados
  // (progreso_empleado, que referencia microcurso_id, no contenido_id)
  // quedan intactos, solo desaparece este contenido de "Contenido
  // cargado".
  async function handleQuitarContenidoVinculado() {
    if (!abiertoId) return;
    setConfirmandoQuitarVinculado(false);
    setProcesandoAccion(true);
    const { error } = await supabase.from('contenidos').delete().eq('id', abiertoId);
    setProcesandoAccion(false);
    if (error) {
      console.error(error);
      setErrorDescartar('No se pudo quitar. Probá de nuevo.');
      return;
    }
    setAbiertoId(null);
    setBorrador(null);
    cargarTodo();
  }

  // Desde "Cursos disponibles" solo pide confirmación. El curso todavía
  // está publicado en este momento, así que acá no hay nada para
  // mostrar u ocultar: eso pasa recién al confirmar.
  function abrirEdicionPublicado(microcursoId) {
    setErrorCambiarVersion(null);
    setConfirmandoVersionId(microcursoId);
  }

  // Al confirmar "Cambiar versión", el curso sale de "Cursos
  // disponibles" al toque (pasa a 'en_revision') y se gestiona desde
  // "Contenido cargado". Esto NO cambia microcursos.version: la versión
  // sube recién al volver a publicar, y solo si la IA le cambió algo (lo
  // hace un trigger en la base, ver
  // supabase/sql/2026-09-24-cursos-versiones.sql).
  async function confirmarEdicionPublicado(microcursoId) {
    setErrorCambiarVersion(null);

    const { error } = await supabase
      .from('microcursos')
      .update({ estado: 'en_revision' })
      .eq('id', microcursoId);

    if (error) {
      // No cerramos el cartel de confirmación: si lo cerráramos acá, esto
      // se ve exactamente como "no pasa nada".
      console.error(error);
      setErrorCambiarVersion('No se pudo cambiar de versión. Probá de nuevo.');
      return;
    }

    setConfirmandoVersionId(null);
    setAccionesVisiblesId(null);
    await cargarTodo();
    await abrirEdicionEnRevision(microcursoId);
  }

  // Trae el contenido actual (pasos + preguntas) de un curso en revisión.
  async function cargarContenidoActual(microcursoId) {
    setCargandoContenidoActual(true);
    const { data: microcurso } = await supabase
      .from('microcursos')
      .select('*')
      .eq('id', microcursoId)
      .maybeSingle();

    if (microcurso) {
      const { data: pasos } = await supabase
        .from('pasos')
        .select('*')
        .eq('microcurso_id', microcursoId)
        .order('orden', { ascending: true });
      setContenidoActualEditando({ microcurso, pasos: pasos || [] });
    } else {
      setContenidoActualEditando(null);
    }
    setCargandoContenidoActual(false);
  }

  // Abre (o cierra) el panel de edición de un curso que ya está en
  // revisión, trayendo su contenido actual para que el dueño lo vea antes
  // de pedir cambios. También sirve para RETOMAR la edición si el dueño
  // salió de la pantalla a mitad de camino.
  async function abrirEdicionEnRevision(microcursoId) {
    setOkActualizar(null);
    if (editandoPublicadoId === microcursoId) {
      setEditandoPublicadoId(null);
      setTextoNuevoPublicado('');
      setErrorActualizar(null);
      setContenidoActualEditando(null);
      return;
    }
    setEditandoPublicadoId(microcursoId);
    setTextoNuevoPublicado('');
    setErrorActualizar(null);
    setContenidoActualEditando(null);
    await cargarContenidoActual(microcursoId);
  }

  function abrirEdicionPuestos(microcurso) {
    setErrorPuestos(null);
    if (editandoPuestosId === microcurso.id) {
      setEditandoPuestosId(null);
      return;
    }
    setEditandoPuestosId(microcurso.id);
    setPuestosSeleccionados(microcurso.puestos_aplicables || []);
  }

  async function handleGuardarPuestos(microcursoId) {
    setGuardandoPuestos(true);
    setErrorPuestos(null);
    // Sin nada tildado, queda "sin definir" (invisible para empleados)
    // hasta que el dueño elija explícitamente Todos o puestos puntuales.
    const valor = puestosSeleccionados.length > 0 ? puestosSeleccionados : null;

    const { error } = await supabase
      .from('microcursos')
      .update({ puestos_aplicables: valor })
      .eq('id', microcursoId);

    setGuardandoPuestos(false);
    if (error) {
      console.error(error);
      setErrorPuestos('No se pudieron guardar los puestos. Probá de nuevo.');
      return;
    }
    setCursosPublicados(
      cursosPublicados.map((m) => (m.id === microcursoId ? { ...m, puestos_aplicables: valor } : m))
    );
    setEditandoPuestosId(null);
  }

  // Regenera con IA un curso que está en revisión. NO toca la versión:
  // actualizar-curso-ia solo marca revision_con_cambios, y la versión
  // sube una sola vez cuando el dueño publica (handlePublicarRevision),
  // aunque haya pedido varios cambios con IA en la misma revisión.
  async function handleActualizarPublicado(microcursoId) {
    if (!puedeUsarIA(cuenta, session.user.email)) {
      setVarianteSuscripcion('ia');
      setMostrarSuscripcion(true);
      return;
    }
    if (!textoNuevoPublicado.trim()) return;

    setActualizandoId(microcursoId);
    setErrorActualizar(null);
    setOkActualizar(null);

    let resultado;
    try {
      resultado = await supabase.functions.invoke('actualizar-curso-ia', {
        method: 'POST',
        body: { microcurso_id: microcursoId, texto_nuevo: textoNuevoPublicado.trim() },
      });
    } catch (err) {
      console.error(err);
      setActualizandoId(null);
      setErrorActualizar('No se pudo conectar con el servidor. Probá de nuevo.');
      return;
    }
    const { data, error } = resultado;

    if (error || data?.error) {
      const { mensaje } = await leerErrorFuncion(error, data, 'No se pudo actualizar el curso. Probá de nuevo.');
      setActualizandoId(null);
      setErrorActualizar(mensaje);
      return;
    }

    // Dejamos el panel abierto con el contenido nuevo, así el dueño lo
    // revisa y decide si publica o pide otro cambio.
    setActualizandoId(null);
    setTextoNuevoPublicado('');
    setOkActualizar('Listo, el curso se actualizó. Revisalo acá arriba y, si está bien, publicalo.');
    await cargarTodo();
    await cargarContenidoActual(microcursoId);
  }

  // Confirma la nueva versión de un curso propio y lo vuelve a publicar
  // (sale de "en revisión", vuelve a estar en "Cursos disponibles"). El
  // trigger de la base sube microcursos.version en 1 en este momento si
  // hubo cambios con IA durante la revisión.
  async function handlePublicarRevision(microcursoId) {
    setPublicandoRevisionId(microcursoId);
    setErrorPublicar(null);
    const { error } = await supabase.from('microcursos').update({ estado: 'aprobado' }).eq('id', microcursoId);
    setPublicandoRevisionId(null);
    if (error) {
      console.error(error);
      setErrorPublicar({ id: microcursoId, mensaje: 'No se pudo publicar. Probá de nuevo.' });
      return;
    }
    if (editandoPublicadoId === microcursoId) {
      setEditandoPublicadoId(null);
      setContenidoActualEditando(null);
      setOkActualizar(null);
    }
    await cargarTodo();
  }

  if (loading) {
    return <p className="text-center mt-24 text-[#6b6455]">Cargando...</p>;
  }

  if (!cuenta && errorCarga) {
    return (
      <div>
        <DashboardNav userEmail={session.user.email} />
        <div className="text-center mt-12 px-4">
          <p className="text-[#C1502E] font-semibold mb-3">{errorCarga}</p>
          <button
            type="button"
            onClick={cargarTodo}
            className="inline-block px-5 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!cuenta) {
    return (
      <div>
        <DashboardNav userEmail={session.user.email} />
        <div className="text-center mt-12 px-4">
          <p className="text-[#6b6455] mb-3">Primero cargá el nombre de tu negocio.</p>
          <a
            href="/sucursales"
            className="inline-block px-5 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
          >
            Ir a Sucursales
          </a>
        </div>
      </div>
    );
  }

  const hasAccess = tieneAccesoBase(cuenta, session.user.email);

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <PageShell>
        <TrialBanner cuenta={cuenta} />
        {errorCarga && (
          <div className="bg-[#FBEAE3] border border-[#F0C9B8] rounded-xl p-3 text-sm text-[#C1502E] font-semibold flex items-center justify-between gap-3 flex-wrap">
            <span>{errorCarga}</span>
            <button
              type="button"
              onClick={cargarTodo}
              className="text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-4 py-2"
              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
            >
              Reintentar
            </button>
          </div>
        )}
        <EstadoBar
          icon={IconContenidoMini}
          label="Contenido"
          right={
            // 2026-09-07, a pedido de Roberto: acá solo se mostraba
            // cursosPublicados.length (los cursos ya disponibles), sin decir
            // nada de lo que hay pendiente en "Contenido cargado" — dos
            // pills en vez de un solo número, para que se entienda cada
            // cantidad a qué corresponde.
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <span className="flex items-center gap-1 text-xs font-bold text-white bg-[#C1502E] rounded-full px-2.5 py-1 whitespace-nowrap">
                Contenido cargado {contenidos.length + cursosEnRevision.length}
              </span>
              <span className="flex items-center gap-1 text-xs font-bold text-white bg-[#7C8B6F] rounded-full px-2.5 py-1 whitespace-nowrap">
                Cursos disponibles {cursosPublicados.length}
              </span>
            </div>
          }
        />
        <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-xl p-4 text-sm text-[#2C4A3A] font-medium">
          Esta es tu <strong>biblioteca de contenido</strong>: subís el material de capacitación
          (manuales en PDF o Word, apuntes de texto, fotos o capturas de pantalla, notas de voz
          grabadas acá mismo o archivos de audio ya grabados), lo marcás como aprobado y desde
          ahí la IA lo convierte en un curso con pasos y evaluación, listo para que lo revises
          antes de publicarlo.
        </div>

        {cursosBase.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#2C2C2A] mb-1">Biblioteca de cursos (opcionales)</h2>
            <p className="text-xs text-[#8a8471] mb-3">
              Cursos ya redactados y listos, se agregan con un clic directo a tus empleados, sin
              pasos intermedios ni edición.
            </p>
            <div className="space-y-2">
              {cursosBase.map((curso) => {
                const yaAgregado = cursosPublicados.some((m) => m.titulo === curso.titulo);
                const seleccionando = seleccionandoBaseId === curso.id;
                const esSegHig = esCursoSeguridadEHigiene(curso.titulo);
                return (
                  <div key={curso.id} className="border border-[#EDE0C8] rounded-xl overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <TituloCursoInline titulo={curso.titulo} className="text-sm font-medium break-words" />
                        {esSegHig && (
                          <p className="text-[10px] font-semibold text-[#8a8471] mt-0.5">
                            Aplica a todos los puestos, no se puede modificar
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => (esSegHig ? handleAgregarBase(curso) : abrirSeleccionBase(curso.id))}
                        disabled={yaAgregado || agregandoBaseId === curso.id}
                        className="w-full sm:w-auto text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-4 py-1.5 flex-shrink-0 disabled:bg-[#EDE0C8] disabled:text-[#8a8471]"
                        style={!yaAgregado ? { textShadow: '0 1px 1px rgba(0,0,0,0.35)' } : undefined}
                      >
                        {yaAgregado
                          ? 'Ya agregado'
                          : agregandoBaseId === curso.id
                          ? 'Agregando...'
                          : esSegHig
                          ? 'Agregar (todos los puestos)'
                          : seleccionando
                          ? 'Cancelar'
                          : 'Agregar a los cursos'}
                      </button>
                    </div>
                    {errorBase?.id === curso.id && (
                      <p className="px-4 pb-3 text-xs font-semibold text-[#C1502E]">{errorBase.mensaje}</p>
                    )}
                    {!esSegHig && seleccionando && (
                      <div className="px-4 pb-4 border-t border-[#EDE0C8] pt-3 space-y-2">
                        <p className="text-xs text-[#8a8471]">
                          ¿A qué puestos aplica? Elegí "Todos los puestos" o puestos puntuales
                          antes de agregarlo (mantené Ctrl o Cmd apretado para elegir varios).
                        </p>
                        <SelectorPuestos
                          seleccionados={puestosBiblioteca}
                          onChange={manejarSeleccionPuestos(setPuestosBiblioteca)}
                        />
                        <button
                          type="button"
                          onClick={() => handleAgregarBase(curso)}
                          disabled={puestosBiblioteca.length === 0 || agregandoBaseId === curso.id}
                          className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#7C8B6F] rounded-full px-4 py-2 disabled:opacity-60"
                          style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                        >
                          {agregandoBaseId === curso.id ? 'Agregando...' : 'Confirmar y agregar'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <div className="flex items-center gap-2 mb-1">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#C1502E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="M7 8l5-5 5 5" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <h2 className="font-semibold text-[#2C2C2A]">Subir contenido nuevo</h2>
          </div>
          <p className="text-xs text-[#8a8471] mb-3">Video no está soportado.</p>
          <form onSubmit={handleSubir} className="space-y-2">
            <input
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título (ej: Manual de caja)"
              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
            />
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={handleDrop}
              className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg px-3 py-3 text-xs cursor-pointer transition-colors ${
                arrastrando
                  ? 'border-[#C1502E] bg-[#FBEAE3] text-[#C1502E]'
                  : 'border-[#EFDDCE] text-[#8a8471]'
              }`}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" />
                <path d="M7 8l5-5 5 5" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              {extrayendoArchivo
                ? 'Leyendo el archivo...'
                : 'Arrastrá un .txt, .pdf, .docx, imagen o audio acá, o hacé clic para elegirlo'}
              <input
                type="file"
                accept=".txt,text/plain,.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp,.mp3,.wav,.m4a,.ogg,audio/*"
                onChange={(e) => handleArchivo(e.target.files?.[0])}
                disabled={extrayendoArchivo}
                className="hidden"
              />
            </label>
            {errorArchivo && <p className="text-xs text-[#C1502E]">{errorArchivo}</p>}

            <div className="border border-[#EFDDCE] rounded-lg p-3">
              <p className="text-xs text-[#8a8471] mb-2">
                O grabá una nota de voz explicando el tema, directo desde acá.
              </p>

              {!grabando && !audioGrabado && (
                <button
                  type="button"
                  onClick={iniciarGrabacion}
                  disabled={extrayendoArchivo}
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-bold tracking-wide text-white bg-[#6B655A] disabled:opacity-60"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                >
                  <IconMicrofono />
                  Grabar audio
                </button>
              )}

              {grabando && (
                <div className="flex items-center justify-between gap-2 bg-[#FBEAE3] rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2 text-xs font-semibold text-[#C1502E]">
                    <span className="w-2 h-2 rounded-full bg-[#C1502E] animate-pulse" />
                    Grabando... {formatearDuracion(segundosGrabados)} / {formatearDuracion(DURACION_MAX_GRABACION_SEG)}
                  </span>
                  <button
                    type="button"
                    onClick={detenerGrabacion}
                    className="text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-3 py-1"
                    style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                  >
                    Detener
                  </button>
                </div>
              )}

              {audioGrabado && !grabando && (
                <div className="space-y-2">
                  <audio controls src={audioGrabado.url} className="w-full h-9" />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={descartarGrabacion}
                      disabled={extrayendoArchivo}
                      className="flex-1 py-2 rounded-lg text-xs font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8] disabled:opacity-60"
                    >
                      Descartar y grabar de nuevo
                    </button>
                    <button
                      type="button"
                      onClick={usarGrabacion}
                      disabled={extrayendoArchivo}
                      className="flex-1 py-2 rounded-lg text-xs font-bold tracking-wide text-white bg-[#C1502E] disabled:opacity-60"
                      style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                    >
                      {extrayendoArchivo ? 'Transcribiendo...' : 'Usar esta grabación'}
                    </button>
                  </div>
                </div>
              )}

              {errorGrabacion && <p className="text-xs text-[#C1502E] mt-2">{errorGrabacion}</p>}
            </div>

            {extrayendoArchivo && (
              <div className="flex items-start gap-3 bg-[#FCF3DD] border border-[#F0DFC4] rounded-lg px-4 py-3">
                <IconSpinner className="animate-spin text-[#8a6d1f] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#8a6d1f]">
                    {tipoProcesando === 'audio' ? 'Transcribiendo tu nota de voz...' : 'Extrayendo el texto de tu archivo...'}
                  </p>
                  <p className="text-xs text-[#8a6d1f] mt-0.5">
                    Puede tardar más si tu conexión es lenta{tipoProcesando === 'audio' ? ' o el audio es largo' : ''}.
                    No cierres ni recargues esta pantalla, el texto va a aparecer acá abajo apenas termine.
                  </p>
                </div>
              </div>
            )}

            <textarea
              required
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pegá acá el texto (por ejemplo, el contenido de tu manual, o la transcripción de un audio explicando el tema)"
              rows={6}
              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none resize-none"
            />
            <button
              type="submit"
              disabled={subiendo || !titulo.trim() || !texto.trim()}
              className="w-full py-2 rounded-lg text-xs font-bold tracking-wide text-white bg-[#C1502E] disabled:opacity-60"
              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
            >
              {subiendo ? 'Guardando...' : 'Guardar contenido'}
            </button>
            {errorSubir && <p className="text-xs font-semibold text-[#C1502E]">{errorSubir}</p>}
          </form>
        </div>

        <div className="bg-white rounded-2xl border-[3px] border-[#C1502E] p-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold text-[#2C2C2A]">Contenido cargado</h2>
            <span className="w-6 h-6 rounded-full bg-[#C1502E] text-white font-bold text-xs flex items-center justify-center">
              {/* 2026-09-07: esto contaba solo contenidos.length, sin sumar
                  los cursos en revisión (cursosEnRevision) que se muestran
                  arriba, en esta misma caja — por eso el número quedaba
                  corto: un curso "Cambiar versión" en revisión se ve acá
                  pero no se contaba. */}
              {contenidos.length + cursosEnRevision.length}
            </span>
          </div>
          {cursosEnRevision.length > 0 && (
            <div className="space-y-2 mb-3">
              {/* Cursos que salieron de "Cursos disponibles" al confirmar
                  "Cambiar versión" (2026-09-07, a pedido de Roberto: esto
                  pasa al toque al confirmar, no hace falta escribir nada
                  todavía). Desde acá se gestionan como un contenido más:
                  "Modificar con IA" abre el panel con el contenido actual
                  y el cuadro para indicar qué cambiar; "Publicar versión"
                  lo vuelve a poner en "Disponible" (con los cambios que
                  se hayan hecho, o tal cual estaba si el dueño se
                  arrepintió y no cambió nada). */}
              {cursosEnRevision.map((m) => {
                const editando = editandoPublicadoId === m.id;
                // La versión sube al publicar, y solo si la IA le cambió
                // algo en esta revisión (ver handlePublicarRevision).
                const versionActual = m.version || 1;
                const conCambios = !!m.revision_con_cambios;
                const versionAPublicar = conCambios ? versionActual + 1 : versionActual;
                return (
                  <div key={m.id} className="border border-[#F0DFC4] bg-[#FDF6ED] rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="text-sm font-semibold text-[#2C2C2A]">{m.titulo}</p>
                        <p className="text-[10px] font-semibold text-[#8a8471]">
                          {conCambios
                            ? `Versión ${versionAPublicar} en revisión, con cambios sin publicar. Tus empleados todavía ven la versión ${versionActual}.`
                            : `Versión ${versionActual} en revisión, todavía no la ven tus empleados.`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 max-w-full">
                        <button
                          type="button"
                          onClick={() => abrirEdicionEnRevision(m.id)}
                          className="text-xs font-bold tracking-wide text-white bg-[#6B655A] rounded-full px-4 py-2"
                          style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                        >
                          {editando ? 'Cerrar' : 'Modificar con IA'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePublicarRevision(m.id)}
                          disabled={publicandoRevisionId === m.id}
                          className="text-xs font-bold tracking-wide text-white bg-[#7C8B6F] rounded-full px-4 py-2 disabled:opacity-60"
                          style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                        >
                          {publicandoRevisionId === m.id
                            ? 'Publicando...'
                            : conCambios
                            ? `Publicar versión ${versionAPublicar}`
                            : 'Volver a publicar sin cambios'}
                        </button>
                      </div>
                    </div>
                    {errorPublicar?.id === m.id && (
                      <p className="text-xs font-semibold text-[#C1502E]">{errorPublicar.mensaje}</p>
                    )}

                    {editando && (
                      <div className="border-t border-[#F0DFC4] pt-3 space-y-3">
                        {cargandoContenidoActual ? (
                          <p className="text-sm text-[#6b6455]">Cargando el contenido actual...</p>
                        ) : contenidoActualEditando ? (
                          <>
                            <div className="bg-[#F5F1E6] rounded-lg p-3 space-y-2 max-h-72 overflow-y-auto">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-[#8a8471]">
                                {contenidoActualEditando.microcurso.revision_con_cambios
                                  ? `Contenido nuevo (versión ${(contenidoActualEditando.microcurso.version || 1) + 1}, sin publicar)`
                                  : `Contenido actual (versión ${contenidoActualEditando.microcurso.version || 1})`}
                              </p>
                              {contenidoActualEditando.pasos.map((p) => (
                                <div key={p.id} className="border border-[#EDE0C8] bg-white rounded-lg p-2.5">
                                  <p className="text-xs font-semibold text-[#2C2C2A] mb-0.5">{p.titulo}</p>
                                  <p className="text-[11px] text-[#6b6455]">{p.contenido}</p>
                                </div>
                              ))}
                              {(contenidoActualEditando.microcurso.preguntas || []).map((preg, i) => (
                                <div key={i} className="border border-[#EDE0C8] bg-white rounded-lg p-2.5">
                                  <p className="text-[11px] font-semibold text-[#2C2C2A] mb-0.5">{preg.pregunta}</p>
                                  <ul className="text-[11px] text-[#6b6455] space-y-0.5">
                                    {preg.opciones.map((op, j) => (
                                      <li key={j} className={j === preg.correcta ? 'text-[#1D9E75] font-semibold' : ''}>
                                        {j === preg.correcta ? '✓ ' : '· '}
                                        {op}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                            {okActualizar && (
                              <p className="text-xs font-semibold text-[#5C6B4F]">{okActualizar}</p>
                            )}
                            <p className="text-xs font-semibold text-[#2C2C2A]">
                              Contá qué querés cambiar o agregar. Se arma el curso de nuevo sumando
                              esto a lo que ya tenía.
                            </p>
                            <textarea
                              value={textoNuevoPublicado}
                              onChange={(e) => setTextoNuevoPublicado(e.target.value)}
                              rows={5}
                              placeholder="Por ejemplo: sumá un paso sobre el cierre de caja de los fines de semana, o corregí el horario del paso 2"
                              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none resize-none"
                            />
                            {errorActualizar && <p className="text-xs text-[#C1502E]">{errorActualizar}</p>}
                            <button
                              type="button"
                              onClick={() => handleActualizarPublicado(m.id)}
                              disabled={actualizandoId === m.id || !textoNuevoPublicado.trim()}
                              className="w-full sm:w-auto flex items-center justify-center gap-1.5 text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-4 py-2 disabled:opacity-60"
                              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                            >
                              <IconVarita />
                              {actualizandoId === m.id ? 'Actualizando...' : 'Actualizar con IA'}
                            </button>
                          </>
                        ) : (
                          <p className="text-xs text-[#C1502E]">No se pudo cargar el contenido actual.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {contenidos.length === 0 ? (
            <p className="text-sm text-[#6b6455]">Todavía no subiste nada.</p>
          ) : (
            <div className="space-y-3">
              {contenidos.map((c) => {
                const abierto = abiertoId === c.id;
                const trabado = estaTrabado(c);
                const estadoInfo = trabado ? ESTADO_INFO.fallido : ESTADO_INFO[c.estado] || ESTADO_INFO.pendiente;
                const generandoEste = generandoIds.has(c.id);
                // Se puede eliminar todo lo que no tiene un curso generado
                // colgando, incluidas las generaciones trabadas o fallidas.
                const puedeEliminar = c.estado === 'pendiente' || c.estado === 'aprobado' || trabado;
                const mensajeErrorGenerar =
                  errorGenerar?.id === c.id
                    ? errorGenerar.mensaje
                    : c.estado === 'aprobado' && c.error_generacion
                    ? c.error_generacion
                    : null;
                return (
                  <div key={c.id} className="border border-[#EDE0C8] rounded-xl overflow-hidden">
                    <div className="p-4">
                      <button type="button" onClick={() => abrirItem(c)} className="w-full text-left block">
                        <div className="flex items-start justify-between mb-1 gap-2">
                          <p className="text-sm font-semibold text-[#2C2C2A] min-w-0">
                            {c.archivo_original || 'Sin título'}
                          </p>
                          <span
                            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{
                              background: estadoInfo.bg,
                              color: estadoInfo.color,
                              textShadow: estadoInfo.nitida ? '0 1px 1px rgba(0,0,0,0.35)' : undefined,
                            }}
                          >
                            {estadoInfo.label}
                          </span>
                        </div>
                        {!abierto && <p className="text-xs text-[#6b6455] line-clamp-2">{c.texto_procesado}</p>}
                        {!abierto && mensajeErrorGenerar && (
                          <p className="text-xs font-semibold text-[#C1502E] mt-1">
                            No se pudo generar el curso: {mensajeErrorGenerar}
                          </p>
                        )}
                      </button>
                      {!abierto &&
                        puedeEliminar &&
                        (confirmandoEliminarId === c.id ? (
                          <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455] space-y-2 mt-2">
                            <p className="font-semibold text-[#2C2C2A]">
                              ¿Eliminar este contenido? No se puede deshacer.
                            </p>
                            {errorEliminar && (
                              <p className="text-xs font-semibold text-[#C1502E]">{errorEliminar}</p>
                            )}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmandoEliminarId(null);
                                  setErrorEliminar(null);
                                }}
                                className="flex-1 py-2 rounded-lg font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8]"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEliminar(c.id)}
                                className="flex-1 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]"
                                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                              >
                                Sí, eliminar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {trabado && (
                              <p className="text-xs font-semibold text-[#C1502E]">
                                La generación se trabó y no terminó. Podés reintentar o eliminar este
                                contenido.
                              </p>
                            )}
                            {trabado && errorGenerar?.id === c.id && (
                              <p className="text-xs text-[#C1502E]">{errorGenerar.mensaje}</p>
                            )}
                            <div className="flex items-center justify-end gap-2">
                              {trabado && (
                                <button
                                  type="button"
                                  onClick={() => handleReintentarGeneracion(c)}
                                  disabled={generandoEste}
                                  className="h-10 text-xs font-bold tracking-wide text-white bg-[#6B655A] rounded-full px-4 disabled:opacity-60"
                                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                                >
                                  {generandoEste ? 'Reintentando...' : 'Reintentar'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setErrorEliminar(null);
                                  setConfirmandoEliminarId(c.id);
                                }}
                                title="Eliminar"
                                aria-label="Eliminar"
                                className="w-10 h-10 rounded-full bg-[#C1502E] text-white flex items-center justify-center flex-shrink-0"
                              >
                                <IconBorrar />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>

                    {abierto && c.estado === 'generando' && !trabado && (
                      <div className="px-4 pb-4 border-t border-[#EDE0C8] pt-3">
                        <p className="text-sm text-[#8a6d1f]">
                          Generando el curso con inteligencia artificial. Puede tardar uno o dos
                          minutos. Podés cerrar esta pantalla o el celular, sigue solo y cuando
                          termine lo vas a ver acá como "Curso generado".
                        </p>
                      </div>
                    )}

                    {abierto && trabado && (
                      <div className="px-4 pb-4 border-t border-[#EDE0C8] pt-3 space-y-2">
                        <p className="text-sm font-semibold text-[#C1502E]">
                          La generación se trabó y no terminó. Podés reintentar o eliminar este
                          contenido.
                        </p>
                        {errorGenerar?.id === c.id && (
                          <p className="text-xs text-[#C1502E]">{errorGenerar.mensaje}</p>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            type="button"
                            onClick={() => handleReintentarGeneracion(c)}
                            disabled={generandoEste}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#6B655A] rounded-full px-4 py-2 disabled:opacity-60"
                            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                          >
                            {generandoEste ? 'Reintentando...' : 'Reintentar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAbiertoId(null);
                              setErrorEliminar(null);
                              setConfirmandoEliminarId(c.id);
                            }}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-4 py-2"
                            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )}

                    {abierto && c.estado !== 'procesado' && c.estado !== 'generando' && (
                      <div className="px-4 pb-4 space-y-2 border-t border-[#EDE0C8] pt-3">
                        <input
                          type="text"
                          required
                          value={tituloEdit}
                          onChange={(e) => setTituloEdit(e.target.value)}
                          placeholder="Título"
                          className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
                        />
                        <textarea
                          value={textoEdit}
                          onChange={(e) => setTextoEdit(e.target.value)}
                          rows={6}
                          className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none resize-none"
                        />
                        {mensajeErrorGenerar && <p className="text-xs text-[#C1502E]">{mensajeErrorGenerar}</p>}
                        {errorItem?.id === c.id && (
                          <p className="text-xs font-semibold text-[#C1502E]">{errorItem.mensaje}</p>
                        )}
                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-1">
                          {c.estado !== 'aprobado' && (
                            <button
                              type="button"
                              onClick={() => handleGuardarEdit(c.id)}
                              disabled={
                                guardandoEdit ||
                                !tituloEdit.trim() ||
                                !textoEdit.trim() ||
                                (tituloEdit === (c.archivo_original || '') && textoEdit === (c.texto_procesado || ''))
                              }
                              className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#7C8B6F] border border-[#7C8B6F] rounded-full px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
                              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                            >
                              {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCambiarEstado(c.id, c.estado)}
                            className={`w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white rounded-full px-4 py-2 border ${
                              c.estado === 'aprobado'
                                ? 'bg-[#8B3A22] border-[#8B3A22]'
                                : 'bg-[#4A5A6B] border-[#4A5A6B]'
                            }`}
                            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                          >
                            {c.estado === 'aprobado' ? 'Marcar como pendiente' : 'Marcar como aprobado'}
                          </button>
                          {c.estado === 'aprobado' && (
                            <button
                              type="button"
                              onClick={() => handleGenerarCurso(c.id)}
                              disabled={generandoEste}
                              className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#6B655A] border border-[#6B655A] rounded-full px-4 py-2 disabled:opacity-60"
                              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                            >
                              {generandoEste ? 'Generando...' : 'Generar curso con IA'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setAbiertoId(null)}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#545C48] border border-[#545C48] rounded-full px-4 py-2"
                            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                          >
                            Salir
                          </button>
                        </div>
                        {c.estado === 'aprobado' && trialActivo(cuenta) && (
                          <p className="text-[10px] text-[#8a8471] mt-1">
                            Durante la prueba gratis podés dejarlo aprobado y listo: generar el
                            curso con IA se habilita al suscribirte.
                          </p>
                        )}
                      </div>
                    )}

                    {abierto && c.estado === 'procesado' && (
                      <div className="px-4 pb-4 border-t border-[#EDE0C8] pt-3">
                        {cargandoBorrador ? (
                          <p className="text-sm text-[#6b6455]">Cargando el curso generado...</p>
                        ) : borrador ? (
                          <div className="space-y-3">
                            <div className="bg-[#FCF3DD] rounded-lg p-3">
                              <p className="text-sm font-semibold text-[#2C2C2A]">{borrador.microcurso.titulo}</p>
                              <p className="text-xs text-[#6b6455]">
                                {borrador.pasos.length} paso{borrador.pasos.length === 1 ? '' : 's'} ·{' '}
                                {(borrador.microcurso.preguntas || []).length} pregunta
                                {(borrador.microcurso.preguntas || []).length === 1 ? '' : 's'}
                              </p>
                            </div>
                            {borrador.pasos.map((p) => (
                              <div key={p.id} className="border border-[#EDE0C8] rounded-lg p-3">
                                <p className="text-sm font-semibold text-[#2C2C2A] mb-1">{p.titulo}</p>
                                <p className="text-xs text-[#6b6455]">{p.contenido}</p>
                              </div>
                            ))}
                            {(borrador.microcurso.preguntas || []).map((preg, i) => (
                              <div key={i} className="border border-[#EDE0C8] rounded-lg p-3">
                                <p className="text-xs font-semibold text-[#2C2C2A] mb-1">{preg.pregunta}</p>
                                <ul className="text-xs text-[#6b6455] space-y-0.5">
                                  {preg.opciones.map((op, j) => (
                                    <li key={j} className={j === preg.correcta ? 'text-[#1D9E75] font-semibold' : ''}>
                                      {j === preg.correcta ? '✓ ' : '· '}
                                      {op}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                            <div className="bg-[#FBF7EA] border border-[#EDE0C8] rounded-lg p-3 space-y-2">
                              <p className="text-xs font-semibold text-[#2C2C2A]">
                                ¿A qué puestos aplica este curso? (mantené Ctrl o Cmd apretado
                                para elegir varios)
                              </p>
                              <SelectorPuestos
                                seleccionados={puestosNuevoCurso}
                                onChange={manejarSeleccionPuestos(setPuestosNuevoCurso)}
                              />
                              {puestosNuevoCurso.length === 0 && (
                                <p className="text-[10px] text-[#C1502E]">
                                  Elegí al menos una opción para poder publicar.
                                </p>
                              )}
                            </div>
                            {errorDescartar && (
                              <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 space-y-2">
                                <p className="text-xs font-semibold text-[#C1502E]">{errorDescartar}</p>
                                {!confirmandoQuitarVinculado ? (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmandoQuitarVinculado(true)}
                                    className="text-xs font-bold tracking-wide text-[#6b6455] underline"
                                  >
                                    Igual quiero sacar este contenido de la lista (no toca el curso publicado)
                                  </button>
                                ) : (
                                  <div className="space-y-2">
                                    <p className="text-xs text-[#6b6455]">
                                      Esto borra solo el texto original que subiste para este
                                      contenido. El curso publicado, sus pasos/preguntas y el
                                      historial de tus empleados no se tocan.
                                    </p>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setConfirmandoQuitarVinculado(false)}
                                        className="flex-1 py-2 rounded-lg font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8]"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleQuitarContenidoVinculado}
                                        disabled={procesandoAccion}
                                        className="flex-1 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E] disabled:opacity-60"
                                        style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                                      >
                                        {procesandoAccion ? 'Quitando...' : 'Sí, quitar solo este contenido'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            {confirmandoDescartar && (
                              <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455] space-y-2">
                                <p className="font-semibold text-[#2C2C2A]">
                                  ¿Descartar este curso generado? El contenido vuelve a quedar
                                  disponible para generar de nuevo.
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setConfirmandoDescartar(false)}
                                    className="flex-1 py-2 rounded-lg font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8]"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleDescartarCurso}
                                    disabled={procesandoAccion}
                                    className="flex-1 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E] disabled:opacity-60"
                                    style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                                  >
                                    {procesandoAccion ? 'Descartando...' : 'Sí, descartar'}
                                  </button>
                                </div>
                              </div>
                            )}
                            {errorAprobar && (
                              <p className="text-xs font-semibold text-[#C1502E]">{errorAprobar}</p>
                            )}
                            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleAprobarCurso}
                                disabled={procesandoAccion || puestosNuevoCurso.length === 0}
                                className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#7C8B6F] border border-[#7C8B6F] rounded-full px-4 py-2 disabled:opacity-60"
                                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                              >
                                {procesandoAccion ? 'Procesando...' : 'Aprobar y publicar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setErrorDescartar(null);
                                  setConfirmandoQuitarVinculado(false);
                                  setConfirmandoDescartar(true);
                                }}
                                disabled={procesandoAccion}
                                className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#C1502E] border border-[#C1502E] rounded-full px-4 py-2 disabled:opacity-60"
                                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                              >
                                Descartar
                              </button>
                              <button
                                type="button"
                                onClick={() => setAbiertoId(null)}
                                className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#545C48] border border-[#545C48] rounded-full px-4 py-2"
                                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                              >
                                Salir
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-[#C1502E]">No se pudo cargar el curso generado.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {cursosPublicados.length > 0 && (
          <div className="bg-white rounded-2xl border-[3px] border-[#7C8B6F] p-6">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-semibold text-[#2C2C2A]">Cursos disponibles</h2>
              <span className="w-6 h-6 rounded-full bg-[#1B2A3D] text-white font-bold text-xs flex items-center justify-center">
                {cursosPublicados.length}
              </span>
            </div>
            <p className="text-xs text-[#8a8471] mb-3">
              El puesto de cada curso se define al publicarlo. Para cambiarle el puesto o el
              contenido más adelante, usá los botones de cada curso.
            </p>
            <div className="space-y-2">
              {cursosPublicados.map((m) => {
                const editandoPuestos = editandoPuestosId === m.id;
                const puestosActuales = m.puestos_aplicables || [];
                const sinDefinir = puestosActuales.length === 0;
                const paraTodos = puestosActuales.includes('TODOS');
                // Reglas de edición por origen del curso (2026-09-06, a
                // pedido de Roberto): un curso propio se puede editar
                // entero (puestos y contenido); uno de la biblioteca solo
                // puestos; Seguridad e Higiene no se toca de ninguna
                // forma, siempre aplica a todos los puestos.
                const esDeBiblioteca = !!m.origen_base_id;
                const esSegHig = esCursoSeguridadEHigiene(m.titulo);
                return (
                  <div key={m.id} className="bg-[#FBF3EC] border border-[#EDE0C8] rounded-xl overflow-hidden">
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <TituloCursoInline titulo={m.titulo} className="text-sm font-medium break-words" />
                          <p className={`text-xs mt-0.5 font-semibold ${sinDefinir ? 'text-[#C1502E]' : 'text-[#8a8471]'}`}>
                            {sinDefinir
                              ? '⚠ Sin puesto asignado, no visible para nadie'
                              : paraTodos
                              ? 'Para todos los puestos'
                              : `Solo para: ${puestosActuales.join(', ')}`}
                            {!esDeBiblioteca && ` · Versión ${m.version || 1}`}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
                          <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#7C8B6F] text-white">
                            Disponible
                          </span>
                          {esSegHig ? null : accionesVisiblesId === m.id ? (
                            <button
                              type="button"
                              onClick={() => setAccionesVisiblesId(null)}
                              className="text-[10px] font-bold uppercase tracking-wide text-white bg-[#C1502E] rounded-full px-3 py-1"
                              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                            >
                              Cancelar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => abrirAccionesPublicado(m.id)}
                              title="Modificar este curso"
                              className="w-8 h-8 rounded-full bg-[#6B655A] text-white flex items-center justify-center mt-2"
                            >
                              <IconLapiz strokeWidth={2.4} />
                            </button>
                          )}
                        </div>
                      </div>
                      {esSegHig && (
                        <p className="text-[10px] font-semibold text-[#8a8471] mt-1">
                          Obligatorio para todos los puestos, no se puede modificar.
                        </p>
                      )}
                      {confirmandoAccionesId === m.id && (
                        <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455] space-y-2 mt-2">
                          <p className="font-semibold text-[#2C2C2A]">
                            Este curso ya está aprobado. ¿Querés cambiarlo?
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmandoAccionesId(null)}
                              className="flex-1 py-2 rounded-lg font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8]"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmandoAccionesId(null);
                                setAccionesVisiblesId(m.id);
                              }}
                              className="flex-1 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]"
                              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                            >
                              Sí, continuar
                            </button>
                          </div>
                        </div>
                      )}
                      {!esSegHig && accionesVisiblesId === m.id && (
                        <div className="flex items-center gap-2 flex-wrap mt-2">
                          <button
                            type="button"
                            onClick={() => abrirEdicionPuestos(m)}
                            className={`text-xs font-bold tracking-wide rounded-lg px-3 py-1.5 border ${
                              editandoPuestos
                                ? 'text-white bg-[#C1502E] border-[#C1502E]'
                                : sinDefinir
                                ? 'text-[#C1502E] border-[#C1502E] bg-[#FBEAE3]'
                                : 'text-white bg-[#8B5E3C] border-[#8B5E3C]'
                            }`}
                            style={
                              editandoPuestos || !sinDefinir
                                ? { textShadow: '0 1px 1px rgba(0,0,0,0.35)' }
                                : { textShadow: '0 1px 1px rgba(0,0,0,0.15)' }
                            }
                          >
                            {editandoPuestos ? 'Cancelar' : sinDefinir ? 'Asignar puestos' : 'Cambiar puestos'}
                          </button>
                          {!esDeBiblioteca && (
                            <button
                              type="button"
                              onClick={() => abrirEdicionPublicado(m.id)}
                              title="Sacarlo de Disponible y gestionar el cambio de contenido con IA desde Contenido cargado"
                              className="text-xs font-bold tracking-wide text-white bg-[#6B655A] border border-[#6B655A] rounded-lg px-3 py-1.5"
                              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                            >
                              Cambiar versión
                            </button>
                          )}
                          {gapsPorCurso[m.id]?.total > 0 && (
                            <button
                              type="button"
                              onClick={() => setGapAbiertoId(gapAbiertoId === m.id ? null : m.id)}
                              className="text-xs font-bold tracking-wide text-[#D69A2D] border border-[#D69A2D] bg-[#FCF3DD] rounded-lg px-3 py-1.5"
                            >
                              {gapsPorCurso[m.id].total} pregunta{gapsPorCurso[m.id].total === 1 ? '' : 's'} frecuente
                              {gapsPorCurso[m.id].total === 1 ? '' : 's'}
                            </button>
                          )}
                        </div>
                      )}
                      {confirmandoVersionId === m.id && (
                        <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455] space-y-2 mt-2">
                          <p className="font-semibold text-[#2C2C2A]">
                            Este curso sale de "Disponible" ahora mismo y pasa a "Contenido
                            cargado". Ahí vas a ver el contenido actual y le vas a poder pedir
                            cambios a la IA. Si lo cambiás, los empleados que ya lo completaron lo
                            van a tener que volver a hacer recién cuando publiques la versión
                            nueva. ¿Querés seguir?
                          </p>
                          {errorCambiarVersion && (
                            <p className="text-xs font-semibold text-[#C1502E]">{errorCambiarVersion}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmandoVersionId(null);
                                setErrorCambiarVersion(null);
                              }}
                              className="flex-1 py-2 rounded-lg font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8]"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => confirmarEdicionPublicado(m.id)}
                              className="flex-1 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]"
                              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                            >
                              Sí, continuar
                            </button>
                          </div>
                        </div>
                      )}
                      {gapAbiertoId === m.id && gapsPorCurso[m.id] && (
                        <div className="mt-2 bg-[#FCF3DD] rounded-lg p-3 space-y-1">
                          <p className="text-[10px] font-semibold text-[#8a6d1f] mb-1">
                            Preguntas que hicieron tus empleados sobre este curso. Capaz que algún
                            paso no quedó claro:
                          </p>
                          {gapsPorCurso[m.id].ejemplos.map((ej, i) => (
                            <p key={i} className="text-xs text-[#6b6455] italic">
                              "{ej}"
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    {editandoPuestos && (
                      <div className="px-4 pb-4 border-t border-[#EDE0C8] pt-3 space-y-2">
                        <p className="text-xs text-[#8a8471]">
                          Elegí "Todos los puestos" para que lo vean todos, o tildá puestos
                          puntuales (mantené Ctrl o Cmd apretado para elegir varios). Sin nada
                          elegido, el curso no es visible para nadie.
                        </p>
                        <SelectorPuestos
                          seleccionados={puestosSeleccionados}
                          onChange={manejarSeleccionPuestos(setPuestosSeleccionados)}
                        />
                        <button
                          type="button"
                          onClick={() => handleGuardarPuestos(m.id)}
                          disabled={guardandoPuestos}
                          className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#7C8B6F] rounded-full px-4 py-2 disabled:opacity-60"
                          style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                        >
                          {guardandoPuestos ? 'Guardando...' : 'Guardar puestos'}
                        </button>
                        {errorPuestos && <p className="text-xs font-semibold text-[#C1502E]">{errorPuestos}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PageShell>

      {mostrarSuscripcion && (
        <SuscripcionRequeridaModal
          variante={varianteSuscripcion}
          onClose={() => setMostrarSuscripcion(false)}
        />
      )}
    </div>
  );
}
