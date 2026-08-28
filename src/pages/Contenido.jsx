import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import SuscripcionRequeridaModal from '../components/SuscripcionRequeridaModal';
import TrialBanner from '../components/TrialBanner';
import { tieneAccesoBase, puedeUsarIA, trialActivo } from '../lib/acceso';
import { TituloCursoInline } from '../components/Badges';
import { capitalizarPalabras } from '../lib/texto';

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

const ESTADO_INFO = {
  pendiente: { bg: '#EDE0C8', color: '#8a8471', label: 'Pendiente' },
  aprobado: { bg: '#eef9f4', color: '#1D9E75', label: 'Aprobado' },
  // "generando": la Edge Function ya devolvió la respuesta rápido y el
  // trabajo pesado (llamar a la IA, armar el curso) sigue en segundo
  // plano en el servidor. Ver procesar-contenido-index.ts.
  generando: { bg: '#DCEAF7', color: '#0055A4', label: 'Generando...' },
  procesado: { bg: '#F0EAFB', color: '#7F5FD1', label: 'Curso generado' },
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
      className="w-full border border-[#EFDDCE] rounded-lg text-sm outline-none px-1 py-1 disabled:opacity-60 [&>option:checked]:text-[#C1502E] [&>option:checked]:[background:linear-gradient(#FBEAE3,#FBEAE3)]"
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

  const [abiertoId, setAbiertoId] = useState(null);
  const [tituloEdit, setTituloEdit] = useState('');
  const [textoEdit, setTextoEdit] = useState('');
  const [guardandoEdit, setGuardandoEdit] = useState(false);

  const [generandoId, setGenerandoId] = useState(null);
  const [errorGenerar, setErrorGenerar] = useState(null);

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

  // Asignación por puesto de un curso ya publicado.
  const [editandoPuestosId, setEditandoPuestosId] = useState(null);
  const [puestosSeleccionados, setPuestosSeleccionados] = useState([]);
  const [guardandoPuestos, setGuardandoPuestos] = useState(false);

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function cargarTodo() {
    setLoading(true);
    const { data: cuentaData } = await supabase
      .from('cuentas')
      .select('*')
      .eq('owner_id', session.user.id)
      .maybeSingle();
    setCuenta(cuentaData);

    if (cuentaData) {
      const { data: publicadosData } = await supabase
        .from('microcursos')
        .select('id, titulo, created_at, puestos_aplicables')
        .eq('cuenta_id', cuentaData.id)
        .eq('estado', 'aprobado')
        .order('created_at', { ascending: false });
      setCursosPublicados(publicadosData || []);

      const idsPublicados = new Set((publicadosData || []).map((m) => m.id));

      const { data: contenidosData } = await supabase
        .from('contenidos')
        .select('*')
        .eq('cuenta_id', cuentaData.id)
        .order('created_at', { ascending: false });

      // Los contenidos cuyo curso ya quedó publicado (aprobado) salen de la
      // lista editable: ya están en "Cursos disponibles para tus empleados",
      // de solo lectura.
      setContenidos((contenidosData || []).filter((c) => !(c.microcurso_id && idsPublicados.has(c.microcurso_id))));

      // Si algún contenido quedó en "generando" (por ejemplo porque se
      // arrancó la generación, se cerró la pestaña o se cortó el
      // celular, y recién ahora se vuelve a abrir la página), el trabajo
      // real puede seguir corriendo en el servidor sin que nadie lo esté
      // mirando. Retomamos la consulta periódica automáticamente acá, sin
      // que haga falta apretar el botón de nuevo.
      (contenidosData || [])
        .filter((c) => c.estado === 'generando')
        .forEach((c) => {
          esperarResultadoGeneracion(c.id);
        });

      supabase.functions.invoke('gaps-conocimiento', { method: 'GET' }).then(({ data, error }) => {
        if (error || !data?.gaps) return;
        const mapa = {};
        data.gaps.forEach((g) => (mapa[g.microcurso_id] = g));
        setGapsPorCurso(mapa);
      });
    }

    const { data: baseData } = await supabase
      .from('cursos_base')
      .select('*')
      .order('orden', { ascending: true });
    setCursosBase(baseData || []);

    setLoading(false);
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
    if (puestosBiblioteca.length === 0) return;

    setAgregandoBaseId(curso.id);

    // Los cursos de biblioteca ya vienen armados (pasos y preguntas
    // redactados a mano), así que se publican directo, sin pasar por
    // texto→aprobar→generar con IA como el resto del contenido.
    const { data: microcurso, error } = await supabase
      .from('microcursos')
      .insert({
        cuenta_id: cuenta.id,
        titulo: curso.titulo,
        duracion_min: curso.duracion_min || 14,
        estado: 'aprobado',
        preguntas: curso.preguntas || [],
        puestos_aplicables: puestosBiblioteca,
      })
      .select()
      .single();

    if (error || !microcurso) {
      console.error(error);
      setAgregandoBaseId(null);
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
      if (pasosError) console.error(pasosError);
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

    const { data, error } = await supabase
      .from('contenidos')
      .insert({
        cuenta_id: cuenta.id,
        tipo: 'texto',
        archivo_original: capitalizarPalabras(titulo.trim()),
        texto_procesado: texto.trim(),
        estado: 'pendiente',
      })
      .select()
      .single();

    setSubiendo(false);
    if (error) {
      console.error(error);
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

  async function abrirItem(c) {
    if (abiertoId === c.id) {
      setAbiertoId(null);
      setBorrador(null);
      setPuestosNuevoCurso([]);
      return;
    }
    setAbiertoId(c.id);
    setTituloEdit(c.archivo_original || '');
    setTextoEdit(c.texto_procesado || '');
    setErrorGenerar(null);
    setBorrador(null);
    setPuestosNuevoCurso([]);

    if (c.estado === 'procesado' && c.microcurso_id) {
      setCargandoBorrador(true);
      const { data: microcurso } = await supabase
        .from('microcursos')
        .select('*')
        .eq('id', c.microcurso_id)
        .maybeSingle();

      if (microcurso) {
        const { data: pasos } = await supabase
          .from('pasos')
          .select('*')
          .eq('microcurso_id', microcurso.id)
          .order('orden', { ascending: true });
        setBorrador({ microcurso, pasos: pasos || [] });
      }
      setCargandoBorrador(false);
    }
  }

  async function handleGuardarEdit(id) {
    if (!tituloEdit.trim() || !textoEdit.trim()) return;
    setGuardandoEdit(true);
    const { data, error } = await supabase
      .from('contenidos')
      .update({ archivo_original: capitalizarPalabras(tituloEdit.trim()), texto_procesado: textoEdit.trim() })
      .eq('id', id)
      .select()
      .single();

    setGuardandoEdit(false);
    if (error) {
      console.error(error);
      return;
    }
    setContenidos(contenidos.map((c) => (c.id === id ? data : c)));
    setAbiertoId(null);
  }

  async function handleCambiarEstado(id, estadoActual) {
    const nuevoEstado = estadoActual === 'aprobado' ? 'pendiente' : 'aprobado';
    const { data, error } = await supabase
      .from('contenidos')
      .update({ estado: nuevoEstado })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(error);
      return;
    }
    setContenidos(contenidos.map((c) => (c.id === id ? data : c)));
  }

  async function handleEliminar(id) {
    if (!confirm('¿Eliminar este contenido? No se puede deshacer.')) return;

    const { error } = await supabase.from('contenidos').delete().eq('id', id);
    if (error) {
      console.error(error);
      return;
    }
    setContenidos(contenidos.filter((c) => c.id !== id));
    setAbiertoId(null);
  }

  // Rediseño 2026-08-26 (tercera vuelta sobre este bug): las dos vueltas
  // anteriores intentaban detectar cuándo se cortaba la conexión del
  // celular durante la espera. El cartel que le apareció a Roberto
  // confirmó que la conexión SÍ se corta de verdad — no hay try/catch del
  // lado del cliente que arregle eso, porque el problema no es el manejo
  // de errores, es que la pestaña deja de estar viva para recibir la
  // respuesta.
  //
  // La solución de fondo es no depender de que la pestaña siga viva:
  // ahora procesar-contenido responde CASI AL INSTANTE (marca el
  // contenido como "generando" y devuelve), y el trabajo pesado (llamar a
  // la IA, armar el curso) sigue en el SERVIDOR en segundo plano,
  // completamente independiente de si el celular sigue conectado, la
  // pestaña se recarga, se cierra la app o se apaga la pantalla. El
  // frontend después solo pregunta cada pocos segundos "¿ya terminó?" en
  // vez de mantener una sola conexión larga y frágil abierta.
  async function handleGenerarCurso(id) {
    if (!puedeUsarIA(cuenta, session.user.email)) {
      setVarianteSuscripcion('ia');
      setMostrarSuscripcion(true);
      return;
    }

    setGenerandoId(id);
    setErrorGenerar(null);

    try {
      const { data, error } = await supabase.functions.invoke('procesar-contenido', {
        method: 'POST',
        body: { contenido_id: id },
      });

      if (error || data?.error) {
        // 2026-08-26: si el servidor manda un `detalle` (el motivo técnico
        // exacto, por ejemplo un error de base de datos), lo mostramos
        // junto al mensaje para no tener que ir a buscar logs de Supabase
        // a mano cada vez que algo falla acá.
        const base = data?.error || 'No se pudo iniciar la generación. Probá de nuevo.';
        setErrorGenerar(data?.detalle ? `${base} (${data.detalle})` : base);
        setGenerandoId(null);
        return;
      }
      // Si llegamos acá, el servidor ya marcó el contenido como
      // "generando" y sigue trabajando solo, tengamos o no la pestaña
      // abierta. cargarTodo() ya lo va a mostrar como "Generando...".
      await cargarTodo();
      await esperarResultadoGeneracion(id);
    } catch (err) {
      console.error(err);
      // Si esto explotó, puede ser que ni siquiera haya llegado a
      // arrancar del lado del servidor, o puede ser que la respuesta se
      // haya cortado justo al volver (y sí haya arrancado). En vez de
      // asumir nada, preguntamos.
      await cargarTodo();
      await esperarResultadoGeneracion(id);
    }
  }

  // Consulta el estado real cada pocos segundos hasta que el contenido
  // deje de estar "generando" (pasó a "procesado" = éxito, o volvió a
  // "aprobado" = terminó con error). Como cada consulta es corta,
  // aguanta bien que el celular pierda señal un rato: la próxima consulta
  // simplemente lo intenta de nuevo. También se llama sola al cargar la
  // página si encuentra algo que quedó "generando" de una visita anterior
  // (ver cargarTodo), así que sobrevive incluso a un cierre completo de
  // la pestaña mientras tanto.
  async function esperarResultadoGeneracion(id) {
    const INTERVALO_MS = 4000;
    const MAX_INTENTOS = 60; // ~4 minutos de margen

    setGenerandoId(id);

    for (let intento = 0; intento < MAX_INTENTOS; intento++) {
      await new Promise((resolve) => setTimeout(resolve, INTERVALO_MS));

      const { data: actual, error } = await supabase
        .from('contenidos')
        .select('estado, microcurso_id, error_generacion')
        .eq('id', id)
        .maybeSingle();

      if (error || !actual) continue; // problema de red puntual, seguimos intentando

      if (actual.estado === 'procesado' && actual.microcurso_id) {
        await cargarTodo();
        setAbiertoId(id);
        abrirItem({ id, estado: 'procesado', microcurso_id: actual.microcurso_id });
        setGenerandoId(null);
        return;
      }

      if (actual.estado === 'aprobado') {
        // Volvió a "aprobado" sin quedar procesado: el trabajo en el
        // servidor terminó, pero con error.
        await cargarTodo();
        setErrorGenerar(actual.error_generacion || 'No se pudo generar el curso. Probá de nuevo.');
        setGenerandoId(null);
        return;
      }
      // Sigue en "generando", seguimos esperando.
    }

    setErrorGenerar(
      'La generación está tardando más de lo normal. Podés cerrar esta pantalla: cuando termine vas a verlo como "Curso generado" al volver a entrar.'
    );
    setGenerandoId(null);
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
    await supabase
      .from('microcursos')
      .update({ estado: 'aprobado', puestos_aplicables: puestosNuevoCurso })
      .eq('id', borrador.microcurso.id);
    setProcesandoAccion(false);
    setAbiertoId(null);
    setBorrador(null);
    setPuestosNuevoCurso([]);
    cargarTodo();
  }

  async function handleDescartarCurso() {
    if (!borrador) return;
    if (!confirm('¿Descartar este curso generado? El contenido vuelve a quedar disponible para generar de nuevo.'))
      return;

    setProcesandoAccion(true);
    await supabase.from('microcursos').delete().eq('id', borrador.microcurso.id);
    await supabase
      .from('contenidos')
      .update({ estado: 'aprobado', microcurso_id: null })
      .eq('id', abiertoId);
    setProcesandoAccion(false);
    setAbiertoId(null);
    setBorrador(null);
    cargarTodo();
  }

  function abrirEdicionPublicado(microcursoId) {
    if (editandoPublicadoId === microcursoId) {
      setEditandoPublicadoId(null);
      setTextoNuevoPublicado('');
      setErrorActualizar(null);
      return;
    }
    const confirmado = confirm(
      'Esto regenera el curso completo con IA (sumando el contenido nuevo al que ya tenía). Los empleados que ya lo completaron van a ver un aviso para volver a hacerlo. ¿Querés continuar?'
    );
    if (!confirmado) return;
    setEditandoPublicadoId(microcursoId);
    setTextoNuevoPublicado('');
    setErrorActualizar(null);
  }

  function abrirEdicionPuestos(microcurso) {
    if (editandoPuestosId === microcurso.id) {
      setEditandoPuestosId(null);
      return;
    }
    setEditandoPuestosId(microcurso.id);
    setPuestosSeleccionados(microcurso.puestos_aplicables || []);
  }

  async function handleGuardarPuestos(microcursoId) {
    setGuardandoPuestos(true);
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
      return;
    }
    setCursosPublicados(
      cursosPublicados.map((m) => (m.id === microcursoId ? { ...m, puestos_aplicables: valor } : m))
    );
    setEditandoPuestosId(null);
  }

  async function handleActualizarPublicado(microcursoId) {
    if (!puedeUsarIA(cuenta, session.user.email)) {
      setVarianteSuscripcion('ia');
      setMostrarSuscripcion(true);
      return;
    }
    if (!textoNuevoPublicado.trim()) return;

    setActualizandoId(microcursoId);
    setErrorActualizar(null);

    const { data, error } = await supabase.functions.invoke('actualizar-curso-ia', {
      method: 'POST',
      body: { microcurso_id: microcursoId, texto_nuevo: textoNuevoPublicado.trim() },
    });

    setActualizandoId(null);

    if (error || data?.error) {
      setErrorActualizar(data?.error || 'No se pudo actualizar el curso. Probá de nuevo.');
      return;
    }

    setEditandoPublicadoId(null);
    setTextoNuevoPublicado('');
    await cargarTodo();
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
        <EstadoBar
          icon={IconContenidoMini}
          label="Contenido"
          right={
            <span className="w-7 h-7 rounded-full bg-[#C1502E] text-white font-bold text-sm flex items-center justify-center">
              {contenidos.length}
            </span>
          }
        />
        <div className="bg-[#E9F1F5] border border-[#CFE0E8] rounded-xl p-4 text-sm text-[#1B3540] font-medium">
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
                return (
                  <div key={curso.id} className="border border-[#EDE0C8] rounded-xl overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-4 py-3">
                      <TituloCursoInline titulo={curso.titulo} className="text-sm font-medium break-words" />
                      <button
                        type="button"
                        onClick={() => abrirSeleccionBase(curso.id)}
                        disabled={yaAgregado}
                        className="w-full sm:w-auto text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-4 py-1.5 flex-shrink-0 disabled:bg-[#EDE0C8] disabled:text-[#8a8471]"
                        style={!yaAgregado ? { textShadow: '0 1px 1px rgba(0,0,0,0.35)' } : undefined}
                      >
                        {yaAgregado ? 'Ya agregado' : seleccionando ? 'Cancelar' : 'Agregar a los cursos'}
                      </button>
                    </div>
                    {seleccionando && (
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
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-bold tracking-wide text-white bg-[#7C8B6F] disabled:opacity-60"
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
              <div className="flex items-start gap-3 bg-[#F0EAFB] border border-[#D9C7F5] rounded-lg px-4 py-3">
                <IconSpinner className="animate-spin text-[#7F5FD1] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#5B3FA6]">
                    {tipoProcesando === 'audio' ? 'Transcribiendo tu nota de voz...' : 'Extrayendo el texto de tu archivo...'}
                  </p>
                  <p className="text-xs text-[#7F5FD1] mt-0.5">
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
              className="w-full py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E] disabled:opacity-60"
              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
            >
              {subiendo ? 'Guardando...' : 'Guardar contenido'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold text-[#2C2C2A]">Contenido cargado</h2>
            <span className="w-6 h-6 rounded-full bg-[#C1502E] text-white font-bold text-xs flex items-center justify-center">
              {contenidos.length}
            </span>
          </div>
          {contenidos.length === 0 ? (
            <p className="text-sm text-[#6b6455]">Todavía no subiste nada.</p>
          ) : (
            <div className="space-y-3">
              {contenidos.map((c) => {
                const abierto = abiertoId === c.id;
                const estadoInfo = ESTADO_INFO[c.estado] || ESTADO_INFO.pendiente;
                return (
                  <div key={c.id} className="border border-[#EDE0C8] rounded-xl overflow-hidden">
                    <button type="button" onClick={() => abrirItem(c)} className="w-full text-left p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-[#2C2C2A]">
                          {c.archivo_original || 'Sin título'}
                        </p>
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 ml-2"
                          style={{ background: estadoInfo.bg, color: estadoInfo.color }}
                        >
                          {estadoInfo.label}
                        </span>
                      </div>
                      {!abierto && <p className="text-xs text-[#6b6455] line-clamp-2">{c.texto_procesado}</p>}
                    </button>

                    {abierto && c.estado === 'generando' && (
                      <div className="px-4 pb-4 border-t border-[#EDE0C8] pt-3">
                        <p className="text-sm text-[#0055A4]">
                          Generando el curso con inteligencia artificial. Puede tardar uno o dos
                          minutos — podés cerrar esta pantalla o incluso el celular, el trabajo
                          sigue solo en el servidor y cuando termine lo vas a ver acá como "Curso
                          generado".
                        </p>
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
                        {errorGenerar && <p className="text-xs text-[#C1502E]">{errorGenerar}</p>}
                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-1">
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
                          <button
                            type="button"
                            onClick={() => handleCambiarEstado(c.id, c.estado)}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-bold text-[#694F11] bg-[#EEB52F] border border-[#B88714] rounded-full px-4 py-2"
                          >
                            {c.estado === 'aprobado' ? 'Marcar como pendiente' : 'Marcar como aprobado'}
                          </button>
                          {c.estado === 'aprobado' && (
                            <button
                              type="button"
                              onClick={() => handleGenerarCurso(c.id)}
                              disabled={generandoId === c.id}
                              className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#0055A4] border border-[#0055A4] rounded-full px-4 py-2 disabled:opacity-60"
                              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                            >
                              {generandoId === c.id ? 'Generando...' : 'Generar curso con IA'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEliminar(c.id)}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#C1502E] border border-[#C1502E] rounded-full px-4 py-2"
                            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                          >
                            Eliminar
                          </button>
                          <button
                            type="button"
                            onClick={() => setAbiertoId(null)}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#A1957D] border border-[#766B56] rounded-full px-4 py-2"
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
                            <div className="bg-[#F0EAFB] rounded-lg p-3">
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
                            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleAprobarCurso}
                                disabled={procesandoAccion || puestosNuevoCurso.length === 0}
                                className="w-full sm:w-auto flex items-center justify-center text-xs font-bold text-[#694F11] bg-[#EEB52F] border border-[#B88714] rounded-full px-4 py-2 disabled:opacity-60"
                              >
                                {procesandoAccion ? 'Procesando...' : 'Aprobar y publicar'}
                              </button>
                              <button
                                type="button"
                                onClick={handleDescartarCurso}
                                disabled={procesandoAccion}
                                className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#C1502E] border border-[#C1502E] rounded-full px-4 py-2 disabled:opacity-60"
                                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                              >
                                Descartar
                              </button>
                              <button
                                type="button"
                                onClick={() => setAbiertoId(null)}
                                className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#A1957D] border border-[#766B56] rounded-full px-4 py-2"
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
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
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
                const editando = editandoPublicadoId === m.id;
                const editandoPuestos = editandoPuestosId === m.id;
                const puestosActuales = m.puestos_aplicables || [];
                const sinDefinir = puestosActuales.length === 0;
                const paraTodos = puestosActuales.includes('TODOS');
                return (
                  <div key={m.id} className="border border-[#EDE0C8] rounded-xl overflow-hidden">
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <TituloCursoInline titulo={m.titulo} className="text-sm font-medium break-words" />
                            <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#1B2A3D] text-white flex-shrink-0">
                              Disponible
                            </span>
                          </div>
                          <p className={`text-[10px] mt-0.5 ${sinDefinir ? 'text-[#C1502E] font-semibold' : 'text-[#8a8471]'}`}>
                            {sinDefinir
                              ? '⚠ Sin puesto asignado, no visible para nadie'
                              : paraTodos
                              ? 'Para todos los puestos'
                              : `Solo para: ${puestosActuales.join(', ')}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => abrirEdicionPublicado(m.id)}
                          title="Regenerar el contenido de este curso con IA"
                          className="flex-shrink-0 text-[9px] font-bold tracking-wide text-white bg-[#0055A4] rounded-full px-2 py-0.5 whitespace-nowrap"
                          style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                        >
                          {editando ? 'Cancelar' : 'Cambiar versión'}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        <button
                          type="button"
                          onClick={() => abrirEdicionPuestos(m)}
                          className={`text-xs font-bold tracking-wide rounded-lg px-3 py-1.5 border ${
                            editandoPuestos
                              ? 'text-white bg-[#C1502E] border-[#C1502E]'
                              : sinDefinir
                              ? 'text-[#C1502E] border-[#C1502E] bg-[#FBEAE3]'
                              : 'text-[#6b6455] border-[#EDE0C8] bg-[#FBF7EA]'
                          }`}
                          style={editandoPuestos ? { textShadow: '0 1px 1px rgba(0,0,0,0.35)' } : undefined}
                        >
                          {editandoPuestos ? 'Cancelar' : sinDefinir ? 'Asignar puestos' : 'Cambiar puestos'}
                        </button>
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
                      {gapAbiertoId === m.id && gapsPorCurso[m.id] && (
                        <div className="mt-2 bg-[#FCF3DD] rounded-lg p-3 space-y-1">
                          <p className="text-[10px] font-semibold text-[#8a6d1f] mb-1">
                            Preguntas que hicieron tus empleados sobre este curso — puede ser señal
                            de que algún paso no quedó claro:
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
                      </div>
                    )}

                    {editando && (
                      <div className="px-4 pb-4 border-t border-[#EDE0C8] pt-3 space-y-2">
                        <p className="text-xs text-[#8a8471]">
                          Sumá el material nuevo acá abajo. La IA va a regenerar el curso completo
                          combinando lo que ya tenía con esto, y se publica solo, sin pasar por
                          aprobación de nuevo.
                        </p>
                        <textarea
                          value={textoNuevoPublicado}
                          onChange={(e) => setTextoNuevoPublicado(e.target.value)}
                          rows={5}
                          placeholder="Pegá acá el contenido nuevo a sumar..."
                          className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none resize-none"
                        />
                        {errorActualizar && <p className="text-xs text-[#C1502E]">{errorActualizar}</p>}
                        <button
                          type="button"
                          onClick={() => handleActualizarPublicado(m.id)}
                          disabled={actualizandoId === m.id || !textoNuevoPublicado.trim()}
                          className="w-full sm:w-auto flex items-center justify-center gap-1.5 text-xs font-bold tracking-wide text-white bg-[#0055A4] rounded-full px-4 py-2 disabled:opacity-60"
                          style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                        >
                          <IconVarita />
                          {actualizandoId === m.id ? 'Actualizando...' : 'Actualizar con IA'}
                        </button>
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
