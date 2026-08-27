import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import { capitalizarPrimeraLetra } from '../lib/texto';

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

export default function Checklists({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [checklists, setChecklists] = useState([]); // v1: como máximo uno por sucursal
  const [runsHoy, setRunsHoy] = useState({}); // checklist_id -> corrida de hoy (o nada)
  const [loading, setLoading] = useState(true);
  const [cambiandoActivacion, setCambiandoActivacion] = useState(false);

  const [editandoNegocioId, setEditandoNegocioId] = useState(null);
  const [tituloEdit, setTituloEdit] = useState('');
  const [itemsEdit, setItemsEdit] = useState([]);
  const [nuevoItem, setNuevoItem] = useState('');
  const [guardando, setGuardando] = useState(false);

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

  function abrirEdicion(negocio, checklistExistente) {
    if (editandoNegocioId === negocio.id) {
      setEditandoNegocioId(null);
      return;
    }
    setEditandoNegocioId(negocio.id);
    setTituloEdit(checklistExistente?.titulo || 'Checklist diario');
    setItemsEdit(checklistExistente ? checklistExistente.checklist_items.map((i) => i.texto) : []);
    setNuevoItem('');
  }

  function agregarItem() {
    if (!nuevoItem.trim()) return;
    setItemsEdit([...itemsEdit, capitalizarPrimeraLetra(nuevoItem.trim())]);
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
    if (!tituloEdit.trim() || itemsEdit.length === 0) return;
    setGuardando(true);

    let checklistId = checklistExistente?.id;

    if (checklistId) {
      await supabase
        .from('checklists')
        .update({ titulo: capitalizarPrimeraLetra(tituloEdit.trim()) })
        .eq('id', checklistId);
      await supabase.from('checklist_items').delete().eq('checklist_id', checklistId);
    } else {
      const { data: nuevo, error } = await supabase
        .from('checklists')
        .insert({
          cuenta_id: cuenta.id,
          negocio_id: negocio.id,
          titulo: capitalizarPrimeraLetra(tituloEdit.trim()),
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
    setEditandoNegocioId(null);
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
            que se repiten todos los días y vos ves desde acá quién las completó.
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
            const checklist = checklists.find((c) => c.negocio_id === negocio.id);
            const editando = editandoNegocioId === negocio.id;
            const run = checklist ? runsHoy[checklist.id] : null;
            // Antes acá se mostraba solo la cantidad ("1 ítem"), que no dice
            // nada de qué se trata el checklist. Mostramos los nombres de
            // los ítems (los primeros 2, con "y N más" si hay más), así se
            // ve de qué es el checklist sin tener que entrar a editarlo.
            const nombresItems = checklist ? checklist.checklist_items.map((i) => i.texto) : [];
            const resumenItems =
              nombresItems.length === 0
                ? 'sin ítems'
                : nombresItems.length <= 2
                ? nombresItems.join(', ')
                : `${nombresItems.slice(0, 2).join(', ')} y ${nombresItems.length - 2} más`;

            return (
              <div key={negocio.id} className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <h3 className="font-semibold text-[#2C2C2A]">{negocio.nombre}</h3>
                  {checklist && checklist.activo && (
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                      style={
                        run
                          ? { background: '#7C8B6F', color: '#FFFFFF' }
                          : { background: '#EDE0C8', color: '#8a8471' }
                      }
                    >
                      {run ? 'Completado hoy' : 'Pendiente hoy'}
                    </span>
                  )}
                </div>

                {checklist && !editando && (
                  <>
                    <p className="text-xs text-[#8a8471] mb-3">
                      {checklist.titulo} · {resumenItems}
                      {!checklist.activo && ' · en pausa'}
                      {run?.empleado_nombre && ` · lo completó ${run.empleado_nombre}`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => abrirEdicion(negocio, checklist)}
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

                {!checklist && !editando && (
                  <button
                    type="button"
                    onClick={() => abrirEdicion(negocio, null)}
                    className="text-xs font-bold tracking-wide text-white bg-[#7C8B6F] rounded-full px-4 py-2"
                    style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                  >
                    Crear checklist para esta sucursal
                  </button>
                )}

                {editando && (
                  <div className="space-y-2 border-t border-[#EDE0C8] pt-3 mt-2">
                    <input
                      type="text"
                      value={tituloEdit}
                      onChange={(e) => setTituloEdit(e.target.value)}
                      placeholder="Título (ej: Apertura del local)"
                      className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
                    />

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
                        onClick={() => guardarChecklist(negocio, checklist)}
                        disabled={guardando || !tituloEdit.trim() || itemsEdit.length === 0}
                        className="text-xs font-bold tracking-wide text-white bg-[#7C8B6F] rounded-full px-4 py-2 disabled:opacity-60"
                        style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                      >
                        {guardando ? 'Guardando...' : 'Guardar checklist'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditandoNegocioId(null)}
                        className="text-xs font-bold text-[#694F11] bg-[#EEB52F] border border-[#B88714] rounded-full px-4 py-2"
                      >
                        Salir
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </PageShell>
    </div>
  );
}
