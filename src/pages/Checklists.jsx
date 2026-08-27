import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import { capitalizarPrimeraLetra } from '../lib/texto';

// Mismo catálogo exacto que usa Empleados.jsx para elegir el puesto de
// cada empleado. Duplicado acá a propósito (no hay un módulo compartido
// para esto todavía): si alguna vez se agrega o saca un puesto del
// catálogo, hay que tocar los dos archivos. Sin "Otro" — acá no se puede
// inventar un puesto nuevo, solo elegir entre los que ya existen.
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

// Fecha de hoy en formato yyyy-mm-dd, según el reloj del navegador de
// quien esté mirando la pantalla. Alcanza para esto (no es un sistema de
// turnos con huso horario crítico), es la misma fecha que va a usar el
// empleado cuando complete el checklist desde su celular.
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// Mismo criterio que usan empleado-info y empleado-checklist para
// microcursos.puestos_aplicables / checklists.puestos_aplicables: sin
// nada cargado = todavía no publicado, ['TODOS'] = para cualquier
// puesto, lista puntual = solo esos.
function resumenPuestos(puestos) {
  if (!puestos || puestos.length === 0) return 'sin publicar (elegí a quién aplica)';
  if (puestos.includes('TODOS')) return 'todos los puestos';
  return `solo ${puestos.join(', ')}`;
}

export default function Checklists({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [empleados, setEmpleados] = useState([]); // solo para armar la lista de puestos ya en uso
  const [checklists, setChecklists] = useState([]); // ahora puede haber varios por sucursal
  const [runsHoy, setRunsHoy] = useState({}); // checklist_id -> corrida de hoy (o nada)
  const [loading, setLoading] = useState(true);
  const [cambiandoActivacion, setCambiandoActivacion] = useState(false);

  // Solo uno de los dos puede estar abierto a la vez: o se está editando
  // un checklist que ya existe, o se está creando uno nuevo para una
  // sucursal puntual.
  const [editandoChecklistId, setEditandoChecklistId] = useState(null);
  const [agregandoNegocioId, setAgregandoNegocioId] = useState(null);

  const [tituloEdit, setTituloEdit] = useState('');
  const [itemsEdit, setItemsEdit] = useState([]);
  const [nuevoItem, setNuevoItem] = useState('');
  const [todosPuestosEdit, setTodosPuestosEdit] = useState(true);
  const [puestosEdit, setPuestosEdit] = useState([]);
  const [guardando, setGuardando] = useState(false);

  // Mismo criterio que Empleados.jsx: el catálogo fijo, más cualquier
  // puesto "Otro" que ya se le haya cargado a algún empleado real de esta
  // cuenta. Así el selector de checklists ofrece exactamente los mismos
  // puestos que existen hoy, ni uno más.
  const puestosPersonalizados = [...new Set(empleados.map((e) => e.puesto).filter(Boolean))].filter(
    (p) => !PUESTOS_CATALOGO_BASE.includes(p)
  );
  const puestosDisponibles = [...PUESTOS_CATALOGO_BASE, ...puestosPersonalizados.sort()];

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

      const negocioIds = (negociosData || []).map((n) => n.id);
      if (negocioIds.length > 0) {
        const { data: empleadosData } = await supabase
          .from('empleados')
          .select('puesto')
          .in('negocio_id', negocioIds);
        setEmpleados(empleadosData || []);
      } else {
        setEmpleados([]);
      }

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
        const { data: runsData } = await supabase
          .from('checklist_runs')
          .select('*')
          .in('checklist_id', listas.map((c) => c.id))
          .eq('fecha', hoyISO());
        const mapa = {};
        (runsData || []).forEach((r) => (mapa[r.checklist_id] = r));
        setRunsHoy(mapa);
      } else {
        setRunsHoy({});
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
    setTituloEdit(checklistExistente?.titulo || 'Checklist diario');
    setItemsEdit(checklistExistente ? checklistExistente.checklist_items.map((i) => i.texto) : []);
    setNuevoItem('');
    const puestos = checklistExistente?.puestos_aplicables;
    const esTodos = !puestos || puestos.length === 0 ? true : puestos.includes('TODOS');
    setTodosPuestosEdit(esTodos);
    setPuestosEdit(esTodos ? [] : puestos);
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
    setItemsEdit([...itemsEdit, capitalizarPrimeraLetra(nuevoItem.trim())]);
    setNuevoItem('');
  }

  function quitarItem(index) {
    setItemsEdit(itemsEdit.filter((_, i) => i !== index));
  }

  function togglePuesto(puesto) {
    setPuestosEdit((actual) =>
      actual.includes(puesto) ? actual.filter((p) => p !== puesto) : [...actual, puesto]
    );
  }

  // Reemplaza todos los ítems en vez de calcular un diff ítem por ítem:
  // la lista siempre es corta (una checklist diaria, no un documento
  // largo como en Contenido/Procedimientos), así que no vale la pena la
  // complejidad extra.
  async function guardarChecklist(negocio, checklistExistente) {
    if (!tituloEdit.trim() || itemsEdit.length === 0) return;
    if (!todosPuestosEdit && puestosEdit.length === 0) return;
    setGuardando(true);

    let checklistId = checklistExistente?.id;
    const puestosAplicables = todosPuestosEdit ? ['TODOS'] : puestosEdit;

    if (checklistId) {
      await supabase
        .from('checklists')
        .update({
          titulo: capitalizarPrimeraLetra(tituloEdit.trim()),
          puestos_aplicables: puestosAplicables,
        })
        .eq('id', checklistId);
      await supabase.from('checklist_items').delete().eq('checklist_id', checklistId);
    } else {
      const { data: nuevo, error } = await supabase
        .from('checklists')
        .insert({
          cuenta_id: cuenta.id,
          negocio_id: negocio.id,
          titulo: capitalizarPrimeraLetra(tituloEdit.trim()),
          puestos_aplicables: puestosAplicables,
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
          <p className="text-xs font-semibold text-[#6b6455] mb-1.5">¿A qué puestos aplica?</p>
          <label className="flex items-center gap-2 text-sm text-[#2C2C2A] font-medium mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={todosPuestosEdit}
              onChange={(e) => setTodosPuestosEdit(e.target.checked)}
              className="accent-[#C1502E]"
            />
            Todos los puestos
          </label>

          {!todosPuestosEdit && (
            <>
              {puestosDisponibles.length === 0 ? (
                <p className="text-xs text-[#8a8471]">
                  Todavía no cargaste ningún puesto en Empleados — cargá al menos un empleado con
                  puesto para poder elegir acá.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {puestosDisponibles.map((puesto) => {
                    const elegido = puestosEdit.includes(puesto);
                    return (
                      <button
                        key={puesto}
                        type="button"
                        onClick={() => togglePuesto(puesto)}
                        className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${
                          elegido
                            ? 'text-white bg-[#C1502E] border-[#C1502E]'
                            : 'text-[#2C2C2A] bg-[#FBF7EA] border-[#EDE0C8]'
                        }`}
                        style={elegido ? { textShadow: '0 1px 1px rgba(0,0,0,0.35)' } : undefined}
                      >
                        {puesto}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
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
            className="text-xs font-bold tracking-wide text-white bg-[#A1957D] border border-[#766B56] rounded-full px-4 py-2"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
          >
            Agregar
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => guardarChecklist(negocio, checklistExistente)}
            disabled={
              guardando || !tituloEdit.trim() || itemsEdit.length === 0 || (!todosPuestosEdit && puestosEdit.length === 0)
            }
            className="text-xs font-bold tracking-wide text-white bg-[#7C8B6F] rounded-full px-4 py-2 disabled:opacity-60"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
          >
            {guardando ? 'Guardando...' : 'Guardar checklist'}
          </button>
          <button
            type="button"
            onClick={cerrarEdicion}
            className="text-xs font-bold tracking-wide text-white bg-[#A26769] rounded-full px-4 py-2"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
          >
            Salir
          </button>
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

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h2 className="font-semibold text-[#2C2C2A] mb-1">Checklists operativos</h2>
          <p className="text-xs font-medium text-[#6b6455] mb-3">
            Esta es una funcionalidad adicional a la capacitación. Tu equipo puede tener tareas
            que se repiten todos los días y vos ves desde acá quién las completó. Podés armar más
            de un checklist por sucursal y elegir a qué puestos le aplica cada uno — por ejemplo,
            que "Cierre de caja" solo lo vea el cajero.
          </p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {['Apertura', 'Cierre', 'Limpieza', 'Caja'].map((ejemplo) => (
              <span
                key={ejemplo}
                className="text-[11px] font-semibold text-[#8a8471] bg-[#FBF7EA] border border-[#EDE0C8] rounded-full px-2.5 py-0.5"
              >
                {ejemplo}
              </span>
            ))}
          </div>
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

            return (
              <div key={negocio.id} className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
                <h3 className="font-semibold text-[#2C2C2A] mb-3">{negocio.nombre}</h3>

                {checklistsDelNegocio.length === 0 && !agregandoAca && (
                  <p className="text-xs text-[#8a8471] mb-3">Todavía no armaste ningún checklist acá.</p>
                )}

                <div className="space-y-4">
                  {checklistsDelNegocio.map((checklist) => {
                    const editando = editandoChecklistId === checklist.id;
                    const run = runsHoy[checklist.id];
                    const nombresItems = checklist.checklist_items.map((i) => i.texto);
                    const resumenItems =
                      nombresItems.length === 0
                        ? 'sin ítems'
                        : nombresItems.length <= 2
                        ? nombresItems.join(', ')
                        : `${nombresItems.slice(0, 2).join(', ')} y ${nombresItems.length - 2} más`;

                    return (
                      <div key={checklist.id} className={checklistsDelNegocio.length > 1 ? 'border-t border-[#F3EEE1] pt-4 first:border-t-0 first:pt-0' : ''}>
                        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                          <p className="text-sm font-bold text-[#2C2C2A]">{checklist.titulo}</p>
                          {checklist.activo && (
                            <span
                              className={
                                run
                                  ? 'text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full'
                                  : 'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border'
                              }
                              style={
                                run
                                  ? { background: '#7C8B6F', color: '#FFFFFF' }
                                  : { background: '#FFF3C4', color: '#C2670A', borderColor: '#E5DAB0' }
                              }
                            >
                              {run ? 'Completado hoy' : 'Pendiente hoy'}
                            </span>
                          )}
                        </div>

                        {!editando && (
                          <>
                            <p className="text-xs font-medium text-[#6b6455] mb-0.5">
                              {resumenItems}
                              {!checklist.activo && ' · en pausa'}
                              {run?.empleado_nombre && ` · lo completó ${run.empleado_nombre}`}
                            </p>
                            <p className="text-xs font-medium text-[#8a8471] mb-3">
                              Para: {resumenPuestos(checklist.puestos_aplicables)}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => abrirEdicionExistente(checklist)}
                                className="text-xs font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8] border border-[#D0C5B0] rounded-full px-4 py-2"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleActivo(checklist)}
                                className="text-xs font-bold tracking-wide text-white bg-[#6B655A] rounded-full px-4 py-2"
                                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                              >
                                {checklist.activo ? 'Pausar' : 'Reactivar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => eliminarChecklist(checklist.id)}
                                className="text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-4 py-2"
                                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                              >
                                Eliminar
                              </button>
                            </div>
                          </>
                        )}

                        {editando && <FormularioChecklist negocio={negocio} checklistExistente={checklist} />}
                      </div>
                    );
                  })}
                </div>

                {!agregandoAca && (
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
      </PageShell>
    </div>
  );
}
