import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';

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

  const [cursosBase, setCursosBase] = useState([]);
  const [agregandoBaseId, setAgregandoBaseId] = useState(null);

  const [abiertoId, setAbiertoId] = useState(null);
  const [tituloEdit, setTituloEdit] = useState('');
  const [textoEdit, setTextoEdit] = useState('');
  const [guardandoEdit, setGuardandoEdit] = useState(false);

  const [generandoId, setGenerandoId] = useState(null);
  const [errorGenerar, setErrorGenerar] = useState(null);

  const [borrador, setBorrador] = useState(null); // { microcurso, pasos }
  const [cargandoBorrador, setCargandoBorrador] = useState(false);
  const [procesandoAccion, setProcesandoAccion] = useState(false);

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
      const { data: contenidosData } = await supabase
        .from('contenidos')
        .select('*')
        .eq('cuenta_id', cuentaData.id)
        .order('created_at', { ascending: false });
      setContenidos(contenidosData || []);
    }

    const { data: baseData } = await supabase
      .from('cursos_base')
      .select('*')
      .order('orden', { ascending: true });
    setCursosBase(baseData || []);

    setLoading(false);
  }

  async function handleAgregarBase(curso) {
    setAgregandoBaseId(curso.id);
    const { data, error } = await supabase
      .from('contenidos')
      .insert({
        cuenta_id: cuenta.id,
        tipo: 'texto',
        archivo_original: curso.titulo,
        texto_procesado: curso.texto,
        estado: 'pendiente',
      })
      .select()
      .single();

    setAgregandoBaseId(null);
    if (error) {
      console.error(error);
      return;
    }
    setContenidos([data, ...contenidos]);
  }

  async function handleSubir(e) {
    e.preventDefault();
    if (!texto.trim()) return;
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

    const esTexto = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt');
    if (!esTexto) {
      setErrorArchivo(
        'Por ahora solo se puede subir archivo .txt. PDF y audio todavía no están armados, es el próximo paso.'
      );
      return;
    }

    const lector = new FileReader();
    lector.onload = (e) => {
      setTexto(e.target.result);
      if (!titulo.trim()) {
        setTitulo(file.name.replace(/\.txt$/i, ''));
      }
    };
    lector.onerror = () => setErrorArchivo('No se pudo leer el archivo. Probá de nuevo.');
    lector.readAsText(file);
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
      return;
    }
    setAbiertoId(c.id);
    setTituloEdit(c.archivo_original || '');
    setTextoEdit(c.texto_procesado || '');
    setErrorGenerar(null);
    setBorrador(null);

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
    setProcesandoAccion(true);
    await supabase.from('microcursos').update({ estado: 'aprobado' }).eq('id', borrador.microcurso.id);
    setProcesandoAccion(false);
    setAbiertoId(null);
    setBorrador(null);
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
              Cursos ya redactados, listos para agregar a tu negocio con un clic. Después los vas a
              poder revisar y editar antes de aprobarlos, igual que cualquier otro contenido.
            </p>
            <div className="space-y-2">
              {cursosBase.map((curso) => {
                const yaAgregado = contenidos.some((c) => c.archivo_original === curso.titulo);
                return (
                  <div
                    key={curso.id}
                    className="flex items-center justify-between gap-3 border border-[#EDE0C8] rounded-xl px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-[#2C2C2A]">{curso.titulo}</p>
                    <button
                      type="button"
                      onClick={() => handleAgregarBase(curso)}
                      disabled={yaAgregado || agregandoBaseId === curso.id}
                      className="text-xs font-semibold text-white bg-[#C1502E] rounded-full px-4 py-1.5 flex-shrink-0 disabled:bg-[#EDE0C8] disabled:text-[#8a8471]"
                    >
                      {yaAgregado ? 'Ya agregado' : agregandoBaseId === curso.id ? 'Agregando...' : 'Agregar'}
                    </button>
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
            Pegá el texto acá abajo, o arrastrá un archivo .txt. PDF y audio directo todavía no están
            armados, es el próximo paso.
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
              Arrastrá un archivo .txt acá, o hacé clic para elegirlo
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => handleArchivo(e.target.files?.[0])}
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
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-[#C1502E] bg-[#FCE38A] rounded-full px-4 py-2 disabled:cursor-not-allowed"
                          >
                            {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCambiarEstado(c.id, c.estado)}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-white bg-[#1D9E75] rounded-full px-4 py-2"
                          >
                            {c.estado === 'aprobado' ? 'Marcar como pendiente' : 'Marcar como aprobado'}
                          </button>
                          {c.estado === 'aprobado' && (
                            <button
                              type="button"
                              onClick={() => handleGenerarCurso(c.id)}
                              disabled={generandoId === c.id}
                              className="w-full sm:w-auto flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-[#7F5FD1] rounded-full px-4 py-2 disabled:opacity-60"
                            >
                              <IconVarita />
                              {generandoId === c.id ? 'Generando...' : 'Generar curso con IA'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEliminar(c.id)}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-white bg-[#C1502E] rounded-full px-4 py-2"
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
                            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleAprobarCurso}
                                disabled={procesandoAccion}
                                className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-white bg-[#1D9E75] rounded-full px-4 py-2 disabled:opacity-60"
                              >
                                {procesandoAccion ? 'Procesando...' : 'Aprobar y publicar'}
                              </button>
                              <button
                                type="button"
                                onClick={handleDescartarCurso}
                                disabled={procesandoAccion}
                                className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-white bg-[#C1502E] rounded-full px-4 py-2 disabled:opacity-60"
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
      </PageShell>
    </div>
  );
}
