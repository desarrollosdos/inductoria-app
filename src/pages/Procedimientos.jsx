import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import SuscripcionRequeridaModal from '../components/SuscripcionRequeridaModal';
import TrialBanner from '../components/TrialBanner';
import { tieneAccesoBase, puedeUsarIA } from '../lib/acceso';
import { generarProcedimientoPDF } from '../lib/procedimiento';

function IconProcedimientos(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 3h6l1 2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3l1-2z" />
      <path d="m9 13 2 2 4-4" />
    </svg>
  );
}

const ESTADO_INFO = {
  pendiente: { bg: '#EDE0C8', color: '#8a8471', label: 'Borrador, a revisar' },
  aprobado: { bg: '#eef9f4', color: '#1D9E75', label: 'Aprobado' },
};

// Los mismos separadores en las tres listas editables (materiales, pasos,
// excepciones), para que el textarea sea simple: una línea = un ítem. En
// excepciones, la condición y la acción van separadas por "::" en la
// misma línea, en vez de armar un formulario con filas dinámicas.
function textoAArray(texto) {
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function excepcionesATexto(excepciones) {
  return (excepciones || []).map((e) => `${e.condicion || ''} :: ${e.accion || ''}`).join('\n');
}

function textoAExcepciones(texto) {
  return textoAArray(texto).map((linea) => {
    const [condicion, ...resto] = linea.split('::');
    return { condicion: (condicion || '').trim(), accion: resto.join('::').trim() };
  });
}

export default function Procedimientos({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [loading, setLoading] = useState(true);

  const [contenidosElegibles, setContenidosElegibles] = useState([]);
  const [procedimientos, setProcedimientos] = useState([]);

  const [generandoId, setGenerandoId] = useState(null);
  const [errorGenerar, setErrorGenerar] = useState(null);

  const [abiertoId, setAbiertoId] = useState(null);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);

  const [mostrarSuscripcion, setMostrarSuscripcion] = useState(false);
  const [varianteSuscripcion, setVarianteSuscripcion] = useState('general');

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
        .select('id, archivo_original, texto_procesado, estado')
        .eq('cuenta_id', cuentaData.id)
        .in('estado', ['aprobado', 'procesado'])
        .order('created_at', { ascending: false });
      setContenidosElegibles(contenidosData || []);

      const { data: procedimientosData } = await supabase
        .from('procedimientos')
        .select('*')
        .eq('cuenta_id', cuentaData.id)
        .order('created_at', { ascending: false });
      setProcedimientos(procedimientosData || []);
    }

    setLoading(false);
  }

  async function handleGenerar(contenidoId) {
    if (!puedeUsarIA(cuenta, session.user.email)) {
      setVarianteSuscripcion('ia');
      setMostrarSuscripcion(true);
      return;
    }

    setGenerandoId(contenidoId);
    setErrorGenerar(null);

    // fetch directo en vez de supabase.functions.invoke: el SDK devuelve
    // data=null en cualquier respuesta que no sea 2xx, y acá necesitamos
    // mostrar el mensaje real (por ejemplo, el aviso de suscripción
    // requerida si alguien esquiva el chequeo del frontend).
    const base = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      const res = await fetch(`${base}/functions/v1/generar-procedimiento`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contenido_id: contenidoId }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || data?.error) {
        setErrorGenerar(data?.error || `No se pudo generar el procedimiento (error ${res.status}).`);
        return;
      }

      await cargarTodo();
      setAbiertoId(data.procedimiento_id);
    } catch (err) {
      console.error(err);
      setErrorGenerar('No se pudo conectar con el servidor. Probá de nuevo.');
    } finally {
      setGenerandoId(null);
    }
  }

  function abrirItem(p) {
    if (abiertoId === p.id) {
      setAbiertoId(null);
      setForm(null);
      return;
    }
    setAbiertoId(p.id);
    setForm({
      titulo: p.titulo || '',
      area: p.area || '',
      responsable: p.responsable || '',
      objetivo: p.objetivo || '',
      alcance: p.alcance || '',
      materialesTexto: (p.materiales || []).join('\n'),
      pasosTexto: (p.pasos || []).join('\n'),
      excepcionesTexto: excepcionesATexto(p.excepciones),
    });
  }

  async function handleGuardar(id) {
    if (!form) return;
    setGuardando(true);

    const { data, error } = await supabase
      .from('procedimientos')
      .update({
        titulo: form.titulo.trim() || 'Sin título',
        area: form.area.trim() || null,
        responsable: form.responsable.trim() || null,
        objetivo: form.objetivo.trim() || null,
        alcance: form.alcance.trim() || null,
        materiales: textoAArray(form.materialesTexto),
        pasos: textoAArray(form.pasosTexto),
        excepciones: textoAExcepciones(form.excepcionesTexto),
      })
      .eq('id', id)
      .select()
      .single();

    setGuardando(false);
    if (error) {
      console.error(error);
      return;
    }
    setProcedimientos(procedimientos.map((p) => (p.id === id ? data : p)));
    setAbiertoId(null);
    setForm(null);
  }

  async function handleCambiarEstado(id, estadoActual) {
    const nuevoEstado = estadoActual === 'aprobado' ? 'pendiente' : 'aprobado';

    if (nuevoEstado === 'aprobado' && !hasAccess) {
      setVarianteSuscripcion('general');
      setMostrarSuscripcion(true);
      return;
    }

    setProcesandoId(id);
    const { data, error } = await supabase
      .from('procedimientos')
      .update({ estado: nuevoEstado })
      .eq('id', id)
      .select()
      .single();
    setProcesandoId(null);
    if (error) {
      console.error(error);
      return;
    }
    setProcedimientos(procedimientos.map((p) => (p.id === id ? data : p)));
  }

  async function handleEliminar(id) {
    if (!confirm('¿Eliminar este procedimiento? No se puede deshacer.')) return;
    const { error } = await supabase.from('procedimientos').delete().eq('id', id);
    if (error) {
      console.error(error);
      return;
    }
    setProcedimientos(procedimientos.filter((p) => p.id !== id));
    setAbiertoId(null);
    setForm(null);
  }

  function handleDescargar(p) {
    generarProcedimientoPDF({ negocioNombre: cuenta?.nombre, procedimiento: p });
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

  const hasAccess = tieneAccesoBase(cuenta, session.user.email);

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <PageShell>
        <TrialBanner cuenta={cuenta} />
        <EstadoBar
          icon={IconProcedimientos}
          label="Procedimientos"
          right={
            <span className="w-7 h-7 rounded-full bg-[#C1502E] text-white font-bold text-sm flex items-center justify-center">
              {procedimientos.length}
            </span>
          }
        />
        <div className="bg-[#E9F1F5] border border-[#CFE0E8] rounded-xl p-4 text-sm text-[#1B3540] font-medium">
          Acá podés generar <strong>procedimientos (SOPs)</strong> a partir del mismo contenido que
          ya cargaste en la biblioteca: objetivo, alcance, qué necesitás a mano, pasos numerados y
          qué hacer ante excepciones. Listo para revisar, ajustar, aprobar y descargar en PDF
          para imprimir o compartir con tu equipo.
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h2 className="font-semibold text-[#2C2C2A] mb-1">Generar procedimiento con IA</h2>
          <p className="text-xs text-[#8a8471] mb-3">
            Elegí un contenido ya aprobado en la biblioteca. Podés generar un procedimiento y un
            curso a partir del mismo contenido, no hace falta elegir uno solo.
          </p>
          {errorGenerar && <p className="text-xs text-[#C1502E] mb-2">{errorGenerar}</p>}
          {contenidosElegibles.length === 0 ? (
            <p className="text-sm text-[#6b6455]">
              Todavía no tenés contenido aprobado. Subilo y aprobalo desde{' '}
              <a href="/contenido" className="font-semibold text-[#C1502E]">
                Contenido
              </a>
              .
            </p>
          ) : (
            <div className="space-y-2">
              {contenidosElegibles.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 border border-[#EDE0C8] rounded-xl px-4 py-3"
                >
                  <p className="text-sm font-medium text-[#2C2C2A] break-words">
                    {c.archivo_original || 'Sin título'}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleGenerar(c.id)}
                    disabled={generandoId === c.id}
                    className="w-full sm:w-auto flex-shrink-0 text-xs font-semibold text-white bg-[#0055A4] rounded-full px-4 py-1.5 disabled:opacity-60"
                  >
                    {generandoId === c.id ? 'Generando...' : 'Generar procedimiento con IA'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold text-[#2C2C2A]">Tus procedimientos</h2>
            <span className="w-6 h-6 rounded-full bg-[#C1502E] text-white font-bold text-xs flex items-center justify-center">
              {procedimientos.length}
            </span>
          </div>
          {procedimientos.length === 0 ? (
            <p className="text-sm text-[#6b6455]">Todavía no generaste ningún procedimiento.</p>
          ) : (
            <div className="space-y-3">
              {procedimientos.map((p) => {
                const abierto = abiertoId === p.id;
                const estadoInfo = ESTADO_INFO[p.estado] || ESTADO_INFO.pendiente;
                return (
                  <div key={p.id} className="border border-[#EDE0C8] rounded-xl overflow-hidden">
                    <button type="button" onClick={() => abrirItem(p)} className="w-full text-left p-4">
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <p className="text-sm font-semibold text-[#2C2C2A]">{p.titulo}</p>
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: estadoInfo.bg, color: estadoInfo.color }}
                        >
                          {estadoInfo.label}
                        </span>
                      </div>
                      {!abierto && (
                        <p className="text-xs text-[#8a8471]">
                          {p.area ? `${p.area} · ` : ''}
                          {(p.pasos || []).length} paso{(p.pasos || []).length === 1 ? '' : 's'}
                        </p>
                      )}
                    </button>

                    {abierto && form && (
                      <div className="px-4 pb-4 space-y-2 border-t border-[#EDE0C8] pt-3">
                        <input
                          type="text"
                          value={form.titulo}
                          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                          placeholder="Título"
                          className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={form.area}
                            onChange={(e) => setForm({ ...form, area: e.target.value })}
                            placeholder="Área (ej: Caja, Depósito)"
                            className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
                          />
                          <input
                            type="text"
                            value={form.responsable}
                            onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                            placeholder="Responsable (ej: Encargado/a de turno)"
                            className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-[#8a8471]">Objetivo</label>
                          <textarea
                            value={form.objetivo}
                            onChange={(e) => setForm({ ...form, objetivo: e.target.value })}
                            rows={2}
                            className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none resize-none mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-[#8a8471]">Alcance</label>
                          <textarea
                            value={form.alcance}
                            onChange={(e) => setForm({ ...form, alcance: e.target.value })}
                            rows={2}
                            className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none resize-none mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-[#8a8471]">
                            Qué necesitás a mano (una por línea)
                          </label>
                          <textarea
                            value={form.materialesTexto}
                            onChange={(e) => setForm({ ...form, materialesTexto: e.target.value })}
                            rows={3}
                            className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none resize-none mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-[#8a8471]">Pasos (uno por línea, en orden)</label>
                          <textarea
                            value={form.pasosTexto}
                            onChange={(e) => setForm({ ...form, pasosTexto: e.target.value })}
                            rows={6}
                            className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none resize-none mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-[#8a8471]">
                            Excepciones — una por línea, formato "condición :: qué hacer"
                          </label>
                          <textarea
                            value={form.excepcionesTexto}
                            onChange={(e) => setForm({ ...form, excepcionesTexto: e.target.value })}
                            rows={3}
                            placeholder="ej: falta un producto en el conteo :: avisar al encargado antes de cerrar caja"
                            className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none resize-none mt-1"
                          />
                        </div>

                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleGuardar(p.id)}
                            disabled={guardando}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-[#C2790C] bg-[#FCE38A] border border-[#F0C24D] rounded-full px-4 py-2 disabled:opacity-60"
                          >
                            {guardando ? 'Guardando...' : 'Guardar cambios'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCambiarEstado(p.id, p.estado)}
                            disabled={procesandoId === p.id}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-[#7C8B6F] bg-[#ECEFE7] border border-[#C9D2BE] rounded-full px-4 py-2 disabled:opacity-60"
                          >
                            {p.estado === 'aprobado' ? 'Marcar como borrador' : 'Aprobar procedimiento'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDescargar(p)}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-white bg-[#1B2A3D] rounded-full px-4 py-2"
                          >
                            Descargar PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEliminar(p.id)}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-[#C1502E] bg-[#FBE0D6] border border-[#F0997B] rounded-full px-4 py-2"
                          >
                            Eliminar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAbiertoId(null);
                              setForm(null);
                            }}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-semibold text-[#8a8471] bg-[#EDE0C8] border border-[#D9C9A3] rounded-full px-4 py-2"
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
