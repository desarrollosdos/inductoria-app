import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import SuscripcionRequeridaModal from '../components/SuscripcionRequeridaModal';

// Cuentas que siempre tienen acceso completo, sin importar el estado de
// la suscripción (equipo interno / pruebas).
const CUENTAS_EXENTAS = [
  'desarrollosdos@gmail.com',
  'lucasanzone@gmail.com',
  'sofiasanzone@gmail.com',
];
import { TituloCursoInline } from '../components/Badges';

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

const ESTADO_INFO = {
  pendiente: { bg: '#EDE0C8', color: '#8a8471', label: 'Pendiente' },
  aprobado: { bg: '#eef9f4', color: '#1D9E75', label: 'Aprobado' },
  procesado: { bg: '#F0EAFB', color: '#7F5FD1', label: 'Curso generado' },
};

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

  const [cursosBase, setCursosBase] = useState([]);
  const [agregandoBaseId, setAgregandoBaseId] = useState(null);
  const [seleccionandoBaseId, setSeleccionandoBaseId] = useState(null);
  const [puestosBiblioteca, setPuestosBiblioteca] = useState([]);

  const [cursosPublicados, setCursosPublicados] = useState([]);

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

  function toggleTodosBiblioteca() {
    setPuestosBiblioteca((prev) => (prev.includes('TODOS') ? [] : ['TODOS']));
  }

  function togglePuestoBiblioteca(puesto) {
    setPuestosBiblioteca((prev) => {
      const sinTodos = prev.filter((p) => p !== 'TODOS');
      return sinTodos.includes(puesto) ? sinTodos.filter((p) => p !== puesto) : [...sinTodos, puesto];
    });
  }

  async function handleAgregarBase(curso) {
    if (!hasAccess) {
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
    if (!texto.trim()) return;

    if (!hasAccess) {
      setMostrarSuscripcion(true);
      return;
    }

    setSubiendo(true);

    const { data, error } = await supabase
      .from('contenidos')
      .insert({
        cuenta_id: cuenta.id,
        tipo: 'texto',
        archivo_original: titulo.trim() || null,
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

  function handleArchivo(file) {
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

    // PDF y .docx pasan por el servidor para extraer el texto.
    setExtrayendoArchivo(true);
    const lectorBinario = new FileReader();
    lectorBinario.onload = async (e) => {
      const base64 = e.target.result.split(',')[1]; // saca el prefijo data:...;base64,
      const { data, error } = await supabase.functions.invoke('extraer-texto-archivo', {
        method: 'POST',
        body: { archivo_base64: base64, nombre_archivo: file.name, tipo: file.type },
      });

      setExtrayendoArchivo(false);

      if (error || data?.error) {
        setErrorArchivo(data?.error || 'No se pudo extraer el texto del archivo.');
        return;
      }

      setTexto(data.texto);
      if (!titulo.trim()) {
        setTitulo(file.name.replace(/\.(pdf|docx)$/i, ''));
      }
    };
    lectorBinario.onerror = () => {
      setExtrayendoArchivo(false);
      setErrorArchivo('No se pudo leer el archivo. Probá de nuevo.');
    };
    lectorBinario.readAsDataURL(file);
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
    setGuardandoEdit(true);
    const { data, error } = await supabase
      .from('contenidos')
      .update({ archivo_original: tituloEdit.trim() || null, texto_procesado: textoEdit.trim() })
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

  async function handleGenerarCurso(id) {
    if (!hasAccess) {
      setMostrarSuscripcion(true);
      return;
    }

    setGenerandoId(id);
    setErrorGenerar(null);

    const { data, error } = await supabase.functions.invoke('procesar-contenido', {
      method: 'POST',
      body: { contenido_id: id },
    });

    setGenerandoId(null);

    if (error || data?.error) {
      setErrorGenerar(data?.error || 'No se pudo generar el curso. Probá de nuevo.');
      return;
    }

    await cargarTodo();
    const actualizado = { id, estado: 'procesado', microcurso_id: data.microcurso_id };
    setAbiertoId(id);
    abrirItem(actualizado);
  }

  async function handleAprobarCurso() {
    if (!borrador) return;
    if (puestosNuevoCurso.length === 0) return;

    if (!hasAccess) {
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

  function toggleTodosNuevo() {
    setPuestosNuevoCurso((prev) => (prev.includes('TODOS') ? [] : ['TODOS']));
  }

  function togglePuestoNuevo(puesto) {
    setPuestosNuevoCurso((prev) => {
      const sinTodos = prev.filter((p) => p !== 'TODOS');
      return sinTodos.includes(puesto) ? sinTodos.filter((p) => p !== puesto) : [...sinTodos, puesto];
    });
  }

  function toggleTodos() {
    setPuestosSeleccionados((prev) => (prev.includes('TODOS') ? [] : ['TODOS']));
  }

  function togglePuesto(puesto) {
    setPuestosSeleccionados((prev) => {
      const sinTodos = prev.filter((p) => p !== 'TODOS');
      return sinTodos.includes(puesto) ? sinTodos.filter((p) => p !== puesto) : [...sinTodos, puesto];
    });
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
    if (!hasAccess) {
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
          <a href="/sucursales" className="inline-block px-5 py-2 rounded-lg font-semibold text-white bg-[#C1502E]">
            Ir a Sucursales
          </a>
        </div>
      </div>
    );
  }

  const hasAccess =
    CUENTAS_EXENTAS.includes(session.user.email) ||
    cuenta.plan === 'active' ||
    cuenta.plan === 'past_due';

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <PageShell>
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
          Esta es tu <strong>biblioteca de contenido</strong>: subís el material (manuales, audios
          transcriptos, apuntes), lo marcás como aprobado, y desde ahí la IA lo convierte en un curso
          con pasos y evaluación, listo para que vos lo revises antes de publicarlo.
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
                        className="w-full sm:w-auto text-xs font-semibold text-white bg-[#C1502E] rounded-full px-4 py-1.5 flex-shrink-0 disabled:bg-[#EDE0C8] disabled:text-[#8a8471]"
                      >
                        {yaAgregado ? 'Ya agregado' : seleccionando ? 'Cancelar' : 'Agregar a los cursos'}
                      </button>
                    </div>
                    {seleccionando && (
                      <div className="px-4 pb-4 border-t border-[#EDE0C8] pt-3 space-y-2">
                        <p className="text-xs text-[#8a8471]">
                          ¿A qué puestos aplica? Elegí "Todos los puestos" o puestos puntuales
                          antes de agregarlo.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <label
                            className={`text-xs font-semibold border rounded-full px-3 py-1.5 cursor-pointer ${
                              puestosBiblioteca.includes('TODOS')
                                ? 'bg-[#1D9E75] text-white border-[#1D9E75]'
                                : 'bg-white text-[#6b6455] border-[#EDE0C8]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={puestosBiblioteca.includes('TODOS')}
                              onChange={toggleTodosBiblioteca}
                              className="hidden"
                            />
                            Todos los puestos
                          </label>
                          {PUESTOS_CATALOGO_BASE.map((p) => (
                            <label
                              key={p}
                              className={`text-xs font-medium border rounded-full px-3 py-1.5 cursor-pointer ${
                                puestosBiblioteca.includes(p)
                                  ? 'bg-[#C1502E] text-white border-[#C1502E]'
                                  : 'bg-white text-[#6b6455] border-[#EDE0C8]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={puestosBiblioteca.includes(p)}
                                onChange={() => togglePuestoBiblioteca(p)}
                                className="hidden"
                              />
                              {p}
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAgregarBase(curso)}
                          disabled={puestosBiblioteca.length === 0 || agregandoBaseId === curso.id}
                          className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-white bg-[#1D9E75] rounded-full px-4 py-2 disabled:opacity-60"
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
          <p className="text-xs text-[#8a8471] mb-3">
            Pegá el texto acá abajo, o arrastrá un archivo .txt, .pdf, .docx, una imagen (captura
            de pantalla o foto) o un audio (nota de voz explicando el tema). Video no está
            soportado.
          </p>
          <form onSubmit={handleSubir} className="space-y-2">
            <input
              type="text"
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
              disabled={subiendo}
              className="w-full py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:opacity-60"
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

                    {abierto && c.estado !== 'procesado' && (
                      <div className="px-4 pb-4 space-y-2 border-t border-[#EDE0C8] pt-3">
                        <input
                          type="text"
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
                              (tituloEdit === (c.archivo_original || '') && textoEdit === (c.texto_procesado || ''))
                            }
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-[#B8860B] bg-[#FCE38A] rounded-full px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCambiarEstado(c.id, c.estado)}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-[#1D9E75] bg-[#D7F2E6] rounded-full px-4 py-2"
                          >
                            {c.estado === 'aprobado' ? 'Marcar como pendiente' : 'Marcar como aprobado'}
                          </button>
                          {c.estado === 'aprobado' && (
                            <button
                              type="button"
                              onClick={() => handleGenerarCurso(c.id)}
                              disabled={generandoId === c.id}
                              className="w-full sm:w-auto flex items-center justify-center gap-1.5 text-xs font-semibold text-[#0055A4] bg-[#DCEAF7] rounded-full px-4 py-2 disabled:opacity-60"
                            >
                              <IconVarita />
                              {generandoId === c.id ? 'Generando...' : 'Generar curso con IA'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEliminar(c.id)}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-[#C1502E] bg-[#FBE0D6] rounded-full px-4 py-2"
                          >
                            Eliminar
                          </button>
                          <button
                            type="button"
                            onClick={() => setAbiertoId(null)}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-[#8a8471] bg-[#EDE0C8] rounded-full px-4 py-2"
                          >
                            Salir
                          </button>
                        </div>
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
                                ¿A qué puestos aplica este curso?
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <label
                                  className={`text-xs font-semibold border rounded-full px-3 py-1.5 cursor-pointer ${
                                    puestosNuevoCurso.includes('TODOS')
                                      ? 'bg-[#1D9E75] text-white border-[#1D9E75]'
                                      : 'bg-white text-[#6b6455] border-[#EDE0C8]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={puestosNuevoCurso.includes('TODOS')}
                                    onChange={toggleTodosNuevo}
                                    className="hidden"
                                  />
                                  Todos los puestos
                                </label>
                                {PUESTOS_CATALOGO_BASE.map((p) => (
                                  <label
                                    key={p}
                                    className={`text-xs font-medium border rounded-full px-3 py-1.5 cursor-pointer ${
                                      puestosNuevoCurso.includes(p)
                                        ? 'bg-[#C1502E] text-white border-[#C1502E]'
                                        : 'bg-white text-[#6b6455] border-[#EDE0C8]'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={puestosNuevoCurso.includes(p)}
                                      onChange={() => togglePuestoNuevo(p)}
                                      className="hidden"
                                    />
                                    {p}
                                  </label>
                                ))}
                              </div>
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
                                className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-[#1D9E75] bg-[#D7F2E6] rounded-full px-4 py-2 disabled:opacity-50"
                              >
                                {procesandoAccion ? 'Procesando...' : 'Aprobar y publicar'}
                              </button>
                              <button
                                type="button"
                                onClick={handleDescartarCurso}
                                disabled={procesandoAccion}
                                className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-[#C1502E] bg-[#FBE0D6] rounded-full px-4 py-2 disabled:opacity-60"
                              >
                                Descartar
                              </button>
                              <button
                                type="button"
                                onClick={() => setAbiertoId(null)}
                                className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-[#8a8471] bg-[#EDE0C8] rounded-full px-4 py-2"
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
              <h2 className="font-semibold text-[#2C2C2A]">Cursos disponibles para tus empleados</h2>
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
                          className="flex-shrink-0 text-[10px] font-semibold text-[#0055A4] border border-[#0055A4] rounded-full px-2.5 py-1 whitespace-nowrap"
                        >
                          {editando ? 'Cancelar' : 'Cambiar versión'}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => abrirEdicionPuestos(m)}
                        className={`mt-2 text-xs font-semibold rounded-lg px-3 py-1.5 border ${
                          sinDefinir
                            ? 'text-[#C1502E] border-[#C1502E] bg-[#FBEAE3]'
                            : 'text-[#6b6455] border-[#EDE0C8]'
                        }`}
                      >
                        {editandoPuestos ? 'Cancelar' : sinDefinir ? 'Asignar puestos' : 'Cambiar puestos'}
                      </button>
                    </div>

                    {editandoPuestos && (
                      <div className="px-4 pb-4 border-t border-[#EDE0C8] pt-3 space-y-2">
                        <p className="text-xs text-[#8a8471]">
                          Elegí "Todos los puestos" para que lo vean todos, o tildá puestos
                          puntuales. Sin nada elegido, el curso no es visible para nadie.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <label
                            className={`text-xs font-semibold border rounded-full px-3 py-1.5 cursor-pointer ${
                              puestosSeleccionados.includes('TODOS')
                                ? 'bg-[#1D9E75] text-white border-[#1D9E75]'
                                : 'bg-white text-[#6b6455] border-[#EDE0C8]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={puestosSeleccionados.includes('TODOS')}
                              onChange={toggleTodos}
                              className="hidden"
                            />
                            Todos los puestos
                          </label>
                          {PUESTOS_CATALOGO_BASE.map((p) => (
                            <label
                              key={p}
                              className={`text-xs font-medium border rounded-full px-3 py-1.5 cursor-pointer ${
                                puestosSeleccionados.includes(p)
                                  ? 'bg-[#C1502E] text-white border-[#C1502E]'
                                  : 'bg-white text-[#6b6455] border-[#EDE0C8]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={puestosSeleccionados.includes(p)}
                                onChange={() => togglePuesto(p)}
                                className="hidden"
                              />
                              {p}
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleGuardarPuestos(m.id)}
                          disabled={guardandoPuestos}
                          className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-white bg-[#1D9E75] rounded-full px-4 py-2 disabled:opacity-60"
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
                          className="w-full sm:w-auto flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-[#0055A4] rounded-full px-4 py-2 disabled:opacity-60"
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
        <SuscripcionRequeridaModal onClose={() => setMostrarSuscripcion(false)} />
      )}
    </div>
  );
}
