import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';

function IconContenidoMini(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 4h6l2 2h8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

export default function Contenido({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [contenidos, setContenidos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [subiendo, setSubiendo] = useState(false);

  const [abiertoId, setAbiertoId] = useState(null);
  const [tituloEdit, setTituloEdit] = useState('');
  const [textoEdit, setTextoEdit] = useState('');
  const [guardandoEdit, setGuardandoEdit] = useState(false);

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

    setLoading(false);
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

  function abrirItem(c) {
    if (abiertoId === c.id) {
      setAbiertoId(null);
      return;
    }
    setAbiertoId(c.id);
    setTituloEdit(c.archivo_original || '');
    setTextoEdit(c.texto_procesado || '');
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
      <EstadoBar
        session={session}
        icon={IconContenidoMini}
        label="Contenido"
        right={
          <span className="w-7 h-7 rounded-full bg-[#C1502E] text-white font-bold text-sm flex items-center justify-center">
            {contenidos.length}
          </span>
        }
      />
      <div className="max-w-4xl mx-auto mt-4 px-4 pb-16 space-y-6">
        <div className="bg-[#E9F1F5] border border-[#CFE0E8] rounded-xl p-4 text-sm text-[#1B3540] font-medium">
          Esta es tu <strong>biblioteca de contenido</strong>: todo lo que subís acá (manuales, audios
          transcriptos, apuntes) queda guardado como "pendiente". El siguiente paso, todavía no
          conectado, es que la IA lo convierta solo en cursos con pasos y evaluación.
        </div>

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
            Por ahora se hace pegando texto acá abajo. Subir un PDF o un audio directo todavía no está
            armado, es el próximo paso.
          </p>
          <form onSubmit={handleSubir} className="space-y-2">
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título (ej: Manual de caja)"
              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
            />
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
                return (
                  <div key={c.id} className="border border-[#EDE0C8] rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => abrirItem(c)}
                      className="w-full text-left p-4"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-[#2C2C2A]">
                          {c.archivo_original || 'Sin título'}
                        </p>
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 ml-2"
                          style={{
                            background: c.estado === 'aprobado' ? '#eef9f4' : '#EDE0C8',
                            color: c.estado === 'aprobado' ? '#1D9E75' : '#8a8471',
                          }}
                        >
                          {c.estado === 'aprobado' ? 'Aprobado' : 'Pendiente'}
                        </span>
                      </div>
                      {!abierto && <p className="text-xs text-[#6b6455] line-clamp-2">{c.texto_procesado}</p>}
                    </button>

                    {abierto && (
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
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleGuardarEdit(c.id)}
                            disabled={
                              guardandoEdit ||
                              (tituloEdit === (c.archivo_original || '') && textoEdit === (c.texto_procesado || ''))
                            }
                            className="text-xs font-semibold text-white bg-[#2C2C2A] rounded-full px-4 py-1.5 disabled:bg-[#EDE0C8] disabled:text-[#8a8471]"
                          >
                            {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCambiarEstado(c.id, c.estado)}
                            className="text-xs font-semibold text-white bg-[#1D9E75] rounded-full px-4 py-1.5"
                          >
                            {c.estado === 'aprobado' ? 'Marcar como pendiente' : 'Marcar como aprobado'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEliminar(c.id)}
                            className="text-xs font-semibold text-white bg-[#C1502E] rounded-full px-4 py-1.5"
                          >
                            Eliminar
                          </button>
                          <button
                            type="button"
                            onClick={() => setAbiertoId(null)}
                            className="text-xs font-semibold text-[#8a8471] border border-[#EDE0C8] rounded-full px-4 py-1.5"
                          >
                            Salir
                          </button>
                        </div>
                      </div>
                    )}
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
