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
        right={<span className="text-sm font-bold text-[#C1502E]">{contenidos.length}</span>}
      />
      <div className="max-w-4xl mx-auto mt-4 px-4 pb-16 space-y-6">
        <div className="bg-[#F5EFE3] border border-[#EFDDCE] rounded-xl p-4 text-sm text-[#3d382c]">
          Esta es tu <strong>biblioteca de contenido</strong>: todo lo que subís acá (manuales, audios
          transcriptos, apuntes) queda guardado como "pendiente". El siguiente paso, todavía no
          conectado, es que la IA lo convierta solo en cursos con pasos y evaluación.
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h2 className="font-semibold text-[#2C2C2A] mb-3">Subir contenido nuevo</h2>
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
          <h2 className="font-semibold text-[#2C2C2A] mb-3">Contenido cargado ({contenidos.length})</h2>
          {contenidos.length === 0 ? (
            <p className="text-sm text-[#6b6455]">Todavía no subiste nada.</p>
          ) : (
            <div className="space-y-3">
              {contenidos.map((c) => (
                <div key={c.id} className="border border-[#F5EFE3] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-[#2C2C2A]">
                      {c.archivo_original || 'Sin título'}
                    </p>
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                      style={{
                        background: c.estado === 'aprobado' ? '#eef9f4' : '#F5EFE3',
                        color: c.estado === 'aprobado' ? '#1D9E75' : '#8a8471',
                      }}
                    >
                      {c.estado === 'aprobado' ? 'Aprobado' : 'Pendiente'}
                    </span>
                  </div>
                  <p className="text-xs text-[#6b6455] line-clamp-2">{c.texto_procesado}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
