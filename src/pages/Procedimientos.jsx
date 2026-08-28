import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import SuscripcionRequeridaModal from '../components/SuscripcionRequeridaModal';
import TrialBanner from '../components/TrialBanner';
import { tieneAccesoBase, puedeUsarIA } from '../lib/acceso';
import { generarProcedimientoPDF } from '../lib/procedimiento';
import { capitalizarPalabras } from '../lib/texto';

// Mismo ícono que ahora usa DashboardNav.jsx para esta sección (hoja con
// la esquina doblada), para que la barra de arriba de esta página y la
// pestaña de la barra de navegación se vean consistentes.
function IconProcedimientos(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" />
      <path d="M13 3v4.5A1.5 1.5 0 0 0 14.5 9H19" />
      <line x1="8.5" y1="13" x2="15.5" y2="13" />
      <line x1="8.5" y1="17" x2="15.5" y2="17" />
    </svg>
  );
}

// Mismo ícono de lápiz (path exacto) que ya usás en Empleados.jsx para "Editar".
function IconLapiz(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}

// No hay un ícono de descarga en Empleados.jsx para copiar, así que este es
// nuevo, pero armado con el mismo trazo (viewBox 24, 15x15, strokeWidth 2,
// puntas redondeadas) para que se sienta de la misma familia.
function IconDescargar(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3v11" />
      <path d="m7 9 5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

// Mismo ícono de tacho de basura (paths exactos) que ya usás en Empleados.jsx
// para "Dar de baja".
function IconBorrar(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

const ESTADO_INFO = {
  pendiente: { bg: '#EDE0C8', color: '#8a8471', label: 'Borrador, a revisar' },
  // Mismo verde salvia que ya se usa en toda la app (chip del usuario logueado
  // en Header.jsx, pestaña Admin de DashboardNav, podio de Progreso.jsx).
  aprobado: { bg: '#7C8B6F', color: '#FFFFFF', label: 'Aprobado' },
};

// Umbral para decidir si un cambio es "chico" (sube la versión menor, ej.
// 1.0 -> 1.1) o "grande" (sube la versión mayor y resetea la menor, ej.
// 1.4 -> 2.0). Se mide como fracción de palabras distintas entre el texto
// completo del procedimiento antes y después de guardar: una comparación
// simple por bolsa de palabras (sin librería de diff nueva), no perfecta
// pero suficiente para distinguir "corregí una coma" de "reescribí la mitad
// del procedimiento". Ajustable si en la práctica queda muy sensible o muy
// laxo.
const UMBRAL_CAMBIO_GRANDE = 0.2;

function textoCompletoDesdeProcedimiento(p) {
  return [
    p.titulo || '',
    p.area || '',
    p.responsable || '',
    p.objetivo || '',
    p.alcance || '',
    ...(p.materiales || []),
    ...(p.pasos || []),
    ...(p.excepciones || []).map((e) => `${e.condicion || ''} ${e.accion || ''}`),
  ].join(' ');
}

function textoCompletoDesdeForm(form) {
  return [
    form.titulo || '',
    form.area || '',
    form.responsable || '',
    form.objetivo || '',
    form.alcance || '',
    ...textoAArray(form.materialesTexto),
    ...textoAArray(form.pasosTexto),
    ...textoAExcepciones(form.excepcionesTexto).map((e) => `${e.condicion || ''} ${e.accion || ''}`),
  ].join(' ');
}

// Fracción (0 a 1) de palabras que cambiaron entre dos textos, comparando
// por bolsa de palabras (no importa el orden). 0 = idéntico, 1 = totalmente
// distinto.
function fraccionDeCambio(textoAnterior, textoNuevo) {
  const palabrasA = textoAnterior.trim().split(/\s+/).filter(Boolean);
  const palabrasB = textoNuevo.trim().split(/\s+/).filter(Boolean);
  if (palabrasA.length === 0 && palabrasB.length === 0) return 0;
  const frecuencia = {};
  palabrasA.forEach((w) => {
    frecuencia[w] = (frecuencia[w] || 0) + 1;
  });
  let comunes = 0;
  palabrasB.forEach((w) => {
    if (frecuencia[w] > 0) {
      comunes++;
      frecuencia[w]--;
    }
  });
  const total = Math.max(palabrasA.length, palabrasB.length);
  return total === 0 ? 0 : 1 - comunes / total;
}

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
  const [errorEstado, setErrorEstado] = useState(null);

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
      const [{ data: contenidosData }, { data: procedimientosData }] = await Promise.all([
        supabase
          .from('contenidos')
          .select('id, archivo_original, texto_procesado, estado')
          .eq('cuenta_id', cuentaData.id)
          .in('estado', ['aprobado', 'procesado'])
          .order('created_at', { ascending: false }),
        supabase
          .from('procedimientos')
          .select('*')
          .eq('cuenta_id', cuentaData.id)
          .order('created_at', { ascending: false }),
      ]);

      // Un contenido deja de ser "elegible" en cuanto ya tiene un
      // procedimiento generado (en cualquier estado, pendiente o
      // aprobado) — así la card de "Generar procedimiento con IA" no
      // queda pegada arriba una vez usada. Si el procedimiento se
      // elimina, el contenido vuelve acá solo, porque cargarTodo() se
      // vuelve a llamar después de eliminar.
      const idsConProcedimiento = new Set((procedimientosData || []).map((p) => p.contenido_id));
      setContenidosElegibles((contenidosData || []).filter((c) => !idsConProcedimiento.has(c.id)));
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
    setErrorEstado(null);
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

    // Comparamos contra el procedimiento tal como estaba antes de abrir el
    // formulario, para decidir si esto fue un cambio chico (sube la versión
    // menor) o grande (sube la versión mayor y resetea la menor).
    const original = procedimientos.find((p) => p.id === id);
    let version_mayor = original?.version_mayor ?? 1;
    let version_menor = original?.version_menor ?? 0;
    if (original) {
      const cambio = fraccionDeCambio(textoCompletoDesdeProcedimiento(original), textoCompletoDesdeForm(form));
      if (cambio >= UMBRAL_CAMBIO_GRANDE) {
        version_mayor += 1;
        version_menor = 0;
      } else if (cambio > 0) {
        version_menor += 1;
      }
      // cambio === 0: no se modificó nada de contenido real, la versión no se mueve.
    }

    const { data, error } = await supabase
      .from('procedimientos')
      .update({
        titulo: form.titulo.trim() ? capitalizarPalabras(form.titulo.trim()) : 'Sin título',
        area: form.area.trim() || null,
        responsable: form.responsable.trim() || null,
        objetivo: form.objetivo.trim() || null,
        alcance: form.alcance.trim() || null,
        materiales: textoAArray(form.materialesTexto),
        pasos: textoAArray(form.pasosTexto),
        excepciones: textoAExcepciones(form.excepcionesTexto),
        version_mayor,
        version_menor,
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

    setErrorEstado(null);
    setProcesandoId(id);
    const { data, error } = await supabase
      .from('procedimientos')
      .update({ estado: nuevoEstado })
      .eq('id', id)
      .select()
      .single();
    setProcesandoId(null);
    if (error) {
      // Antes esto solo quedaba en la consola del navegador y en
      // pantalla no pasaba nada — ahora se muestra el motivo real
      // (por ejemplo, un problema de permisos en Supabase) en vez de
      // que parezca que el botón "no hace nada".
      console.error(error);
      setErrorEstado(
        `No se pudo ${nuevoEstado === 'aprobado' ? 'aprobar' : 'volver a borrador'} el procedimiento: ${error.message}`
      );
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
    setAbiertoId(null);
    setForm(null);
    // Recargamos todo (en vez de solo sacar el item de la lista local)
    // para que el contenido que quedó sin procedimiento vuelva a
    // aparecer en "Generar procedimiento con IA".
    await cargarTodo();
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
        <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-xl p-4 text-sm text-[#2C4A3A] font-medium">
          Acá podés generar <strong>procedimientos (SOPs)</strong> a partir del mismo contenido que
          ya cargaste en la biblioteca: objetivo, alcance, qué necesitás a mano, pasos numerados y
          qué hacer ante excepciones. Listo para revisar, ajustar, aprobar y descargar en PDF
          para imprimir o compartir con tu equipo.
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h2 className="font-semibold text-[#2C2C2A] mb-1">Generar procedimiento con IA</h2>
          <p className="text-xs text-[#8a8471] mb-3">
            Elegí un contenido ya aprobado en la biblioteca. Podés generar un procedimiento y un
            curso a partir del mismo contenido, no hace falta elegir uno solo. Un contenido que ya
            tiene un procedimiento generado deja de aparecer acá hasta que lo elimines.
          </p>
          {errorGenerar && <p className="text-xs text-[#C1502E] mb-2">{errorGenerar}</p>}
          {contenidosElegibles.length === 0 ? (
            <p className="text-sm text-[#6b6455]">
              Todavía no tenés contenido aprobado sin procedimiento generado. Subilo y aprobalo desde{' '}
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
                    <div className="p-4">
                      <div className="flex items-stretch justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#2C2C2A] break-words">{p.titulo}</p>
                          {!abierto && (
                            <p className="text-xs text-[#8a8471] mt-0.5">
                              {p.area ? `${p.area} · ` : ''}
                              {(p.pasos || []).length} paso{(p.pasos || []).length === 1 ? '' : 's'}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-center justify-between min-h-16 flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => abrirItem(p)}
                              title="Editar"
                              className="w-8 h-8 rounded-full bg-[#EDE0C8] text-[#2C2C2A] flex items-center justify-center"
                            >
                              <IconLapiz />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDescargar(p)}
                              title="Descargar PDF"
                              className="w-8 h-8 rounded-full bg-[#1B2A3D] text-white flex items-center justify-center"
                            >
                              <IconDescargar />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEliminar(p.id)}
                              title="Eliminar"
                              className="w-8 h-8 rounded-full bg-[#C1502E] text-white flex items-center justify-center"
                            >
                              <IconBorrar />
                            </button>
                          </div>
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                            style={{ background: estadoInfo.bg, color: estadoInfo.color }}
                          >
                            {estadoInfo.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {abierto && form && (
                      <div className="px-4 pb-4 space-y-4 border-t border-[#EDE0C8] pt-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-[#C1502E] mb-2">
                            Datos generales
                          </p>
                          <div className="space-y-2">
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
                          </div>
                        </div>

                        <div className="border-t border-[#F3EAD9] pt-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-[#C1502E] mb-2">
                            Objetivo y alcance
                          </p>
                          <div className="space-y-2">
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
                          </div>
                        </div>

                        <div className="border-t border-[#F3EAD9] pt-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-[#C1502E] mb-2">
                            Contenido del procedimiento
                          </p>
                          <div className="space-y-2">
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
                              <label className="text-xs font-semibold text-[#8a8471]">
                                Pasos (uno por línea, en orden)
                              </label>
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
                          </div>
                        </div>

                        {errorEstado && (
                          <p className="text-xs text-[#C1502E]">{errorEstado}</p>
                        )}

                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleGuardar(p.id)}
                            disabled={guardando}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#7C8B6F] border border-[#7C8B6F] rounded-full px-4 py-2 disabled:opacity-60"
                            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                          >
                            {guardando ? 'Guardando...' : 'Guardar cambios'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCambiarEstado(p.id, p.estado)}
                            disabled={procesandoId === p.id}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-bold text-[#694F11] bg-[#EEB52F] border border-[#B88714] rounded-full px-4 py-2 disabled:opacity-60"
                          >
                            {procesandoId === p.id
                              ? 'Procesando...'
                              : p.estado === 'aprobado'
                              ? 'Marcar como borrador'
                              : 'Aprobar procedimiento'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAbiertoId(null);
                              setForm(null);
                            }}
                            className="w-full sm:w-auto flex items-center justify-center text-xs font-bold tracking-wide text-white bg-[#A1957D] border border-[#766B56] rounded-full px-4 py-2"
                            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
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
