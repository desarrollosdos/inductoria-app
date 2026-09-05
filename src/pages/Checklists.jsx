import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import SuscripcionRequeridaModal from '../components/SuscripcionRequeridaModal';
import { tieneAccesoBase } from '../lib/acceso';
import { capitalizarPalabras } from '../lib/texto';

// Mismo catálogo que usa Empleados.jsx / Contenido.jsx para el campo
// "puesto" — se duplica acá porque son archivos separados sin un módulo
// compartido de constantes todavía. Si agregás un puesto nuevo al
// catálogo, replicalo en los tres archivos.
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

// Mismo componente exacto que usa Contenido.jsx para "¿a qué puestos
// aplica este curso?" — acá se reutiliza tal cual (mismo desplegable,
// mismos colores de selección del navegador) para que sea la misma
// interacción en toda la app.
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

// Misma regla de negocio que Contenido.jsx: "Todos los puestos" es
// excluyente con puestos puntuales.
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

function IconChecklistMini(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 3h6l1 2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3l1-2z" />
      <path d="m8 11 1.3 1.3L12 9.8" />
      <path d="m8 16 1.3 1.3L12 14.8" />
    </svg>
  );
}

function IconQuitarChico(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </svg>
  );
}

// Mismo ícono de lápiz (path exacto) que ya usás en Empleados.jsx/Procedimientos.jsx para "Editar".
function IconLapiz(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}

function IconHistorial(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function IconPausa(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="none" {...props}>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function IconPlay(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="none" {...props}>
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}

// Mismo ícono de tacho de basura (paths exactos) que ya usás en Empleados.jsx/Procedimientos.jsx.
function IconBorrar(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

const ETIQUETA_PERIODO = { diario: 'hoy', semanal: 'esta semana', mensual: 'este mes' };
const NOMBRE_PERIODICIDAD = { diario: 'Diario', semanal: 'Semanal', mensual: 'Mensual' };
// Cuántos períodos hacia atrás se miran para calcular el % de
// cumplimiento — 30 días, 12 semanas o 6 meses son ventanas razonables
// para que el número diga algo sin ir a buscar años de historial.
const VENTANA_METRICAS = { diario: 30, semanal: 12, mensual: 6 };

// El "ancla" del período al que pertenece una fecha dada, según la
// periodicidad del checklist: el día exacto si es diario, el lunes de
// esa semana si es semanal, o el día 1 del mes si es mensual. Mismo
// criterio que usa empleado-checklist del lado del servidor — checklist_runs.fecha
// se sigue usando tal cual, solo cambia qué representa.
function fechaAncla(periodicidad, base) {
  if (periodicidad === 'semanal') {
    const dia = base.getUTCDay(); // 0 = domingo
    const diff = (dia === 0 ? -6 : 1) - dia;
    const lunes = new Date(base);
    lunes.setUTCDate(base.getUTCDate() + diff);
    return lunes.toISOString().slice(0, 10);
  }
  if (periodicidad === 'mensual') {
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  return base.toISOString().slice(0, 10);
}

function anclaActual(periodicidad) {
  return fechaAncla(periodicidad, new Date());
}

// Las anclas de los últimos N períodos (el actual incluido), de más
// reciente a más viejo — para calcular el % de cumplimiento contra el
// historial real.
function anclasRecientes(periodicidad, cantidad) {
  const hoy = new Date();
  const anclas = [];
  for (let i = 0; i < cantidad; i++) {
    const base = new Date(hoy);
    if (periodicidad === 'semanal') base.setUTCDate(hoy.getUTCDate() - i * 7);
    else if (periodicidad === 'mensual') base.setUTCMonth(hoy.getUTCMonth() - i);
    else base.setUTCDate(hoy.getUTCDate() - i);
    anclas.push(fechaAncla(periodicidad, base));
  }
  return anclas;
}

function resumenPuestos(puestos) {
  if (!puestos || puestos.length === 0) return 'sin publicar (elegí a quién aplica)';
  if (puestos.includes('TODOS')) return 'todos los puestos';
  return `solo ${puestos.join(', ')}`;
}

function formatearFechaAncla(fecha, periodicidad) {
  const d = new Date(`${fecha}T00:00:00Z`);
  if (periodicidad === 'mensual') {
    return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  if (periodicidad === 'semanal') {
    return `semana del ${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
  }
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function Checklists({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [checklists, setChecklists] = useState([]); // puede haber varios por sucursal
  const [runsPorChecklist, setRunsPorChecklist] = useState({}); // checklist_id -> [{fecha, empleado_nombre}], más reciente primero
  const [loading, setLoading] = useState(true);
  const [cambiandoActivacion, setCambiandoActivacion] = useState(false);
  const [historialAbiertoId, setHistorialAbiertoId] = useState(null);

  // Solo uno de los dos puede estar abierto a la vez: o se está editando
  // un checklist que ya existe, o se está creando uno nuevo para una
  // sucursal puntual.
  const [editandoChecklistId, setEditandoChecklistId] = useState(null);
  const [agregandoNegocioId, setAgregandoNegocioId] = useState(null);

  const [tituloEdit, setTituloEdit] = useState('');
  const [itemsEdit, setItemsEdit] = useState([]);
  const [nuevoItem, setNuevoItem] = useState('');
  const [periodicidadEdit, setPeriodicidadEdit] = useState('diario');
  const [puestosEdit, setPuestosEdit] = useState(['TODOS']);
  const [guardando, setGuardando] = useState(false);

  // Bloqueo completo de la sección cuando no hay acceso (2026-09-05, a
  // pedido de Roberto): a diferencia del resto de la app, Checklists no
  // usa IA, así que no tiene ningún costo ni contador que delate el uso
  // gratis — sin este bloqueo, cualquier cuenta sin pago podría seguir
  // armando y usando checklists para siempre sin que nadie se entere.
  // Por eso acá se tapa la sección entera (ni ver, ni crear, ni editar),
  // a diferencia de Procedimientos, donde generar/aprobar con IA ya
  // corta lo que importa y no hace falta tapar todo.
  const [mostrarSuscripcion, setMostrarSuscripcion] = useState(false);

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
      const { data: negociosData } = await supabase
        .from('negocios')
        .select('id, nombre')
        .eq('cuenta_id', cuentaData.id)
        .order('nombre', { ascending: true });
      setNegocios(negociosData || []);

      const { data: checklistsData } = await supabase
        .from('checklists')
        .select('*, checklist_items(*)')
        .eq('cuenta_id', cuentaData.id);

      const listas = (checklistsData || []).map((c) => ({
        ...c,
        checklist_items: (c.checklist_items || []).slice().sort((a, b) => a.orden - b.orden),
      }));
      setChecklists(listas);

      if (listas.length > 0) {
        // Se trae TODO el historial (no solo el período actual): hace
        // falta para la lista de "ver historial" y para calcular el %
        // de cumplimiento de cada checklist.
        const { data: runsData } = await supabase
          .from('checklist_runs')
          .select('checklist_id, fecha, empleado_nombre')
          .in('checklist_id', listas.map((c) => c.id))
          .order('fecha', { ascending: false });

        const mapa = {};
        (runsData || []).forEach((r) => {
          if (!mapa[r.checklist_id]) mapa[r.checklist_id] = [];
          mapa[r.checklist_id].push(r);
        });
        setRunsPorChecklist(mapa);
      } else {
        setRunsPorChecklist({});
      }
    }

    setLoading(false);
  }

  async function handleActivar() {
    setCambiandoActivacion(true);
    const { error } = await supabase
      .from('cuentas')
      .update({ checklists_habilitado: true })
      .eq('id', cuenta.id);
    setCambiandoActivacion(false);
    if (error) {
      console.error(error);
      return;
    }
    setCuenta({ ...cuenta, checklists_habilitado: true });
  }

  async function handleDesactivar() {
    if (
      !confirm(
        '¿Desactivar los checklists operativos? Los que ya armaste no se borran, solo dejan de verse hasta que los actives de nuevo.'
      )
    )
      return;
    setCambiandoActivacion(true);
    const { error } = await supabase
      .from('cuentas')
      .update({ checklists_habilitado: false })
      .eq('id', cuenta.id);
    setCambiandoActivacion(false);
    if (error) {
      console.error(error);
      return;
    }
    setCuenta({ ...cuenta, checklists_habilitado: false });
  }

  function cerrarEdicion() {
    setEditandoChecklistId(null);
    setAgregandoNegocioId(null);
  }

  function cargarFormularioDesde(checklistExistente) {
    setTituloEdit(checklistExistente?.titulo || '');
    setItemsEdit(checklistExistente ? checklistExistente.checklist_items.map((i) => i.texto) : []);
    setNuevoItem('');
    setPeriodicidadEdit(checklistExistente?.periodicidad || 'diario');
    const puestos = checklistExistente?.puestos_aplicables;
    setPuestosEdit(!puestos || puestos.length === 0 ? ['TODOS'] : puestos);
  }

  function abrirEdicionExistente(checklist) {
    if (editandoChecklistId === checklist.id) {
      cerrarEdicion();
      return;
    }
    setAgregandoNegocioId(null);
    setEditandoChecklistId(checklist.id);
    cargarFormularioDesde(checklist);
  }

  function abrirNuevoChecklist(negocioId) {
    if (agregandoNegocioId === negocioId) {
      cerrarEdicion();
      return;
    }
    setEditandoChecklistId(null);
    setAgregandoNegocioId(negocioId);
    cargarFormularioDesde(null);
  }

  function agregarItem() {
    if (!nuevoItem.trim()) return;
    setItemsEdit([...itemsEdit, capitalizarPalabras(nuevoItem.trim())]);
    setNuevoItem('');
  }

  function quitarItem(index) {
    setItemsEdit(itemsEdit.filter((_, i) => i !== index));
  }

  // Reemplaza todos los ítems en vez de calcular un diff ítem por ítem:
  // la lista siempre es corta (una checklist diaria, no un documento
  // largo como en Contenido/Procedimientos), así que no vale la pena la
  // complejidad extra.
  async function guardarChecklist(negocio, checklistExistente) {
    if (!tituloEdit.trim() || itemsEdit.length === 0 || puestosEdit.length === 0) return;
    setGuardando(true);

    let checklistId = checklistExistente?.id;

    if (checklistId) {
      await supabase
        .from('checklists')
        .update({
          titulo: capitalizarPalabras(tituloEdit.trim()),
          puestos_aplicables: puestosEdit,
          periodicidad: periodicidadEdit,
        })
        .eq('id', checklistId);
      await supabase.from('checklist_items').delete().eq('checklist_id', checklistId);
    } else {
      const { data: nuevo, error } = await supabase
        .from('checklists')
        .insert({
          cuenta_id: cuenta.id,
          negocio_id: negocio.id,
          titulo: capitalizarPalabras(tituloEdit.trim()),
          puestos_aplicables: puestosEdit,
          periodicidad: periodicidadEdit,
        })
        .select()
        .single();
      if (error || !nuevo) {
        console.error(error);
        setGuardando(false);
        return;
      }
      checklistId = nuevo.id;
    }

    const itemsAInsertar = itemsEdit.map((texto, orden) => ({ checklist_id: checklistId, texto, orden }));
    const { error: itemsError } = await supabase.from('checklist_items').insert(itemsAInsertar);
    if (itemsError) console.error(itemsError);

    setGuardando(false);
    cerrarEdicion();
    await cargarTodo();
  }

  async function eliminarChecklist(checklistId) {
    if (
      !confirm('¿Eliminar este checklist? También se borra el historial de días completados. No se puede deshacer.')
    )
      return;
    const { error } = await supabase.from('checklists').delete().eq('id', checklistId);
    if (error) {
      console.error(error);
      return;
    }
    await cargarTodo();
  }

  async function toggleActivo(checklist) {
    const { error } = await supabase
      .from('checklists')
      .update({ activo: !checklist.activo })
      .eq('id', checklist.id);
    if (error) {
      console.error(error);
      return;
    }
    await cargarTodo();
  }

  // Formulario de alta/edición, compartido entre "editar uno que ya
  // existe" y "crear uno nuevo para esta sucursal" — es el mismo bloque
  // en los dos casos, solo cambia a qué checklist (o negocio, si es
  // nuevo) se le aplica al guardar.
  function FormularioChecklist({ negocio, checklistExistente }) {
    return (
      <div className="space-y-3 border-t border-[#EDE0C8] pt-3 mt-2">
        <input
          type="text"
          value={tituloEdit}
          onChange={(e) => setTituloEdit(e.target.value)}
          placeholder="Título (ej: Apertura del local)"
          className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
        />

        <div>
          <p className="text-xs font-semibold text-[#6b6455] mb-1.5">¿Con qué frecuencia se completa?</p>
          <div className="flex gap-1.5">
            {Object.entries(NOMBRE_PERIODICIDAD).map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setPeriodicidadEdit(valor)}
                className={`text-xs font-bold tracking-wide rounded-full px-3 py-1.5 ${
                  periodicidadEdit === valor
                    ? 'text-white bg-[#C1502E]'
                    : 'text-[#2C2C2A] bg-[#FBF7EA] border border-[#EDE0C8]'
                }`}
                style={periodicidadEdit === valor ? { textShadow: '0 1px 1px rgba(0,0,0,0.35)' } : undefined}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-[#6b6455] mb-1.5">
            ¿A qué puestos aplica? (Ctrl/Cmd para elegir varios)
          </p>
          <SelectorPuestos seleccionados={puestosEdit} onChange={manejarSeleccionPuestos(setPuestosEdit)} />
        </div>

        {itemsEdit.length > 0 && (
          <div className="space-y-1.5">
            {itemsEdit.map((texto, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-[#FBF7EA] border border-[#EDE0C8] rounded-lg px-3 py-2"
              >
                <span className="flex-1 text-sm text-[#2C2C2A]">{texto}</span>
                <button
                  type="button"
                  onClick={() => quitarItem(i)}
                  title="Quitar"
                  className="w-6 h-6 rounded-full bg-[#EDE0C8] text-[#8a8471] flex items-center justify-center flex-shrink-0"
                >
                  <IconQuitarChico />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={nuevoItem}
            onChange={(e) => setNuevoItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                agregarItem();
              }
            }}
            placeholder="Agregar ítem (ej: Contar la caja)"
            className="flex-1 border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={agregarItem}
            className="text-xs font-bold tracking-wide text-white bg-[#6B655A] border border-[#6B655A] rounded-full px-4 py-2"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
          >
            Agregar
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => guardarChecklist(negocio, checklistExistente)}
            disabled={guardando || !tituloEdit.trim() || itemsEdit.length === 0 || puestosEdit.length === 0}
            className="text-xs font-bold tracking-wide text-white bg-[#4A453D] rounded-full px-4 py-2 disabled:opacity-60"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
          >
            {guardando ? 'Guardando...' : 'Guardar checklist'}
          </button>
          <button
            type="button"
            onClick={cerrarEdicion}
            className="text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-4 py-2"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
          >
            Salir
          </button>
        </div>
      </div>
    );
  }

  // Historial + métricas de un checklist puntual, colapsable. Se calcula
  // todo en el cliente a partir de runsPorChecklist (ya trae todo el
  // historial, no solo el período actual).
  function HistorialYMetricas({ checklist }) {
    const runs = runsPorChecklist[checklist.id] || [];
    const ventana = VENTANA_METRICAS[checklist.periodicidad] || 30;
    const anclas = anclasRecientes(checklist.periodicidad, ventana);
    const fechasConRun = new Set(runs.map((r) => r.fecha));
    const cumplidos = anclas.filter((a) => fechasConRun.has(a)).length;
    const tasa = Math.round((cumplidos / ventana) * 100);

    const conteoPorEmpleado = {};
    runs.forEach((r) => {
      if (!r.empleado_nombre) return;
      conteoPorEmpleado[r.empleado_nombre] = (conteoPorEmpleado[r.empleado_nombre] || 0) + 1;
    });
    const topEmpleado = Object.entries(conteoPorEmpleado).sort((a, b) => b[1] - a[1])[0];

    return (
      <div className="mt-3 bg-[#FBF7EA] border border-[#EDE0C8] rounded-xl p-3 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8471]">
              Cumplimiento (últimos {ventana})
            </p>
            <p className="text-sm font-bold text-[#2C2C2A]">
              {cumplidos}/{ventana} · {tasa}%
            </p>
          </div>
          {topEmpleado && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8471]">Lo completa más</p>
              <p className="text-sm font-bold text-[#2C2C2A]">
                {topEmpleado[0]} ({topEmpleado[1]})
              </p>
            </div>
          )}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8471] mb-1">
            Historial reciente
          </p>
          {runs.length === 0 ? (
            <p className="text-xs text-[#8a8471]">Todavía no se completó ninguna vez.</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {runs.slice(0, 15).map((r, i) => (
                <p key={i} className="text-xs text-[#3d382c]">
                  {formatearFechaAncla(r.fecha, checklist.periodicidad)}
                  {r.empleado_nombre && ` · ${r.empleado_nombre}`}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
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
        <EstadoBar
          icon={IconChecklistMini}
          label="Checklists"
          right={
            <span className="w-7 h-7 rounded-full bg-[#C1502E] text-white font-bold text-sm flex items-center justify-center">
              {checklists.filter((c) => c.activo).length}
            </span>
          }
        />

        {!hasAccess ? (
          <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-4 text-sm text-[#6b6455] flex items-center justify-between gap-3 flex-wrap">
            <span>Necesitás una suscripción activa para usar los checklists operativos.</span>
            <button
              type="button"
              onClick={() => setMostrarSuscripcion(true)}
              className="text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-4 py-2 flex-shrink-0"
              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
            >
              Suscribirme
            </button>
          </div>
        ) : (
          <>
            <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-xl p-4 text-sm text-[#2C4A3A] font-medium">
              <p className="mb-3">
                <strong>Checklists operativos</strong>: funcionalidad adicional a la capacitación. Tu
                equipo puede tener tareas que se repiten y vos ves desde acá quién las completó. Podés
                armar más de un checklist por sucursal, elegir si es diario, semanal o mensual, y a
                qué puestos le aplica cada uno — por ejemplo, que "Cierre de caja" solo lo vea el
                cajero.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['Apertura', 'Cierre', 'Limpieza', 'Caja'].map((ejemplo) => (
                  <span
                    key={ejemplo}
                    className="text-[11px] font-semibold text-[#8a8471] bg-[#FBF7EA] border border-[#EDE0C8] rounded-full px-2.5 py-0.5"
                  >
                    {ejemplo}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#EFDDCE] p-4 flex">
              {cuenta.checklists_habilitado ? (
                <button
                  type="button"
                  onClick={handleDesactivar}
                  disabled={cambiandoActivacion}
                  className="text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-4 py-2 disabled:opacity-60"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                >
                  Desactivar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleActivar}
                  disabled={cambiandoActivacion}
                  className="text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-4 py-2 disabled:opacity-60"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                >
                  {cambiandoActivacion ? 'Activando...' : 'Activar'}
                </button>
              )}
            </div>

            {cuenta.checklists_habilitado && negocios.length === 0 && (
              <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
                <p className="text-sm text-[#6b6455]">Primero cargá al menos una sucursal en Sucursales.</p>
              </div>
            )}

            {cuenta.checklists_habilitado &&
              negocios.map((negocio) => {
                const checklistsDelNegocio = checklists.filter((c) => c.negocio_id === negocio.id);
                const agregandoAca = agregandoNegocioId === negocio.id;
                const editandoAlgunoAca = checklistsDelNegocio.some((c) => c.id === editandoChecklistId);

                return (
                  <div key={negocio.id} className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
                    <h3 className="font-semibold text-[#2C2C2A] mb-3">{negocio.nombre}</h3>

                    {checklistsDelNegocio.length === 0 && !agregandoAca && (
                      <p className="text-xs text-[#8a8471] mb-3">Todavía no armaste ningún checklist acá.</p>
                    )}

                    <div className="space-y-4">
                      {checklistsDelNegocio.map((checklist) => {
                        const editando = editandoChecklistId === checklist.id;
                        const periodicidad = checklist.periodicidad || 'diario';
                        const runs = runsPorChecklist[checklist.id] || [];
                        const runActual = runs.find((r) => r.fecha === anclaActual(periodicidad));
                        const nombresItems = checklist.checklist_items.map((i) => i.texto);
                        const resumenItems =
                          nombresItems.length === 0
                            ? 'sin ítems'
                            : nombresItems.length <= 2
                            ? nombresItems.join(', ')
                            : `${nombresItems.slice(0, 2).join(', ')} y ${nombresItems.length - 2} más`;
                        const historialAbierto = historialAbiertoId === checklist.id;

                        return (
                          <div key={checklist.id} className={checklistsDelNegocio.length > 1 ? 'border-t border-[#F3EEE1] pt-4 first:border-t-0 first:pt-0' : ''}>
                            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                              <p className="text-sm font-bold text-[#2C2C2A]">{checklist.titulo}</p>
                              {checklist.activo && (
                                <span
                                  className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                                  style={{
                                    background: runActual ? '#7C8B6F' : '#6B655A',
                                    color: '#FFFFFF',
                                    textShadow: '0 1px 1px rgba(0,0,0,0.35)',
                                  }}
                                >
                                  {runActual ? `Completado ${ETIQUETA_PERIODO[periodicidad]}` : `Pendiente ${ETIQUETA_PERIODO[periodicidad]}`}
                                </span>
                              )}
                            </div>

                            {!editando && (
                              <>
                                <p className="text-xs font-medium text-[#6b6455] mb-0.5">
                                  {NOMBRE_PERIODICIDAD[periodicidad]} · {resumenItems}
                                  {!checklist.activo && ' · en pausa'}
                                  {runActual?.empleado_nombre && ` · lo completó ${runActual.empleado_nombre}`}
                                </p>
                                <p className="text-xs font-medium text-[#8a8471] mb-3">
                                  Para: {resumenPuestos(checklist.puestos_aplicables)}
                                </p>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => abrirEdicionExistente(checklist)}
                                    title="Editar"
                                    className="w-8 h-8 rounded-full bg-[#6B655A] text-white flex items-center justify-center"
                                  >
                                    <IconLapiz />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setHistorialAbiertoId(historialAbierto ? null : checklist.id)}
                                    title={historialAbierto ? 'Ocultar historial' : 'Ver historial'}
                                    className="w-8 h-8 rounded-full bg-[#6E2A38] text-white flex items-center justify-center"
                                  >
                                    <IconHistorial />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleActivo(checklist)}
                                    title={checklist.activo ? 'Pausar' : 'Reactivar'}
                                    className="w-8 h-8 rounded-full bg-[#6B655A] text-white flex items-center justify-center"
                                  >
                                    {checklist.activo ? <IconPausa /> : <IconPlay />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => eliminarChecklist(checklist.id)}
                                    title="Eliminar"
                                    className="w-8 h-8 rounded-full bg-[#C1502E] text-white flex items-center justify-center"
                                  >
                                    <IconBorrar />
                                  </button>
                                </div>
                                {historialAbierto && <HistorialYMetricas checklist={checklist} />}
                              </>
                            )}

                            {editando && <FormularioChecklist negocio={negocio} checklistExistente={checklist} />}
                          </div>
                        );
                      })}
                    </div>

                    {!agregandoAca && !editandoAlgunoAca && (
                      <button
                        type="button"
                        onClick={() => abrirNuevoChecklist(negocio.id)}
                        className={`text-xs font-bold tracking-wide text-white bg-[#7C8B6F] rounded-full px-4 py-2 ${
                          checklistsDelNegocio.length > 0 ? 'mt-4' : ''
                        }`}
                        style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                      >
                        Agregar checklist
                      </button>
                    )}

                    {agregandoAca && <FormularioChecklist negocio={negocio} checklistExistente={null} />}
                  </div>
                );
              })}
          </>
        )}
      </PageShell>

      {mostrarSuscripcion && (
        <SuscripcionRequeridaModal onClose={() => setMostrarSuscripcion(false)} />
      )}
    </div>
  );
}
