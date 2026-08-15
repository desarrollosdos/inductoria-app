import { useEffect, useRef, useState } from 'react';
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

const PUESTOS_CATALOGO = [
  'Vendedor/a',
  'Cajero/a',
  'Encargado/a',
  'Estilista / Peluquero/a',
  'Manicura / Cosmetóloga',
  'Recepcionista',
  'Repositor/a',
  'Kiosquero/a',
  'Panadero/a',
  'Otro',
];

function IconEmpleadosMini(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <circle cx="17.5" cy="8.5" r="2.4" />
      <path d="M15.5 14.3c2.6.3 4.5 2.5 4.5 5.2" />
    </svg>
  );
}

function IconCamara(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconGaleria(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

// Mensajes de validación de campos obligatorios en castellano (el
// navegador muestra "Please fill out this field" en inglés por default).
function validarCampo(e) {
  const el = e.target;
  if (el.validity.valueMissing) {
    el.setCustomValidity('Completá este campo.');
  } else if (el.validity.typeMismatch) {
    el.setCustomValidity('Ingresá un mail válido.');
  } else {
    el.setCustomValidity('');
  }
}
function limpiarValidacion(e) {
  e.target.setCustomValidity('');
}

// Recorta la foto a un cuadrado (centrado), listo para mostrar en círculo.
function recortarACuadrado(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const lado = Math.min(img.width, img.height);
        const sx = (img.width - lado) / 2;
        const sy = (img.height - lado) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, lado, lado, 0, 0, 400, 400);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Avatar({ e, size = 36 }) {
  const estilo = { width: size, height: size, border: '2px solid #C1502E' };
  if (e.foto_url) {
    return (
      <img
        src={e.foto_url}
        alt={e.nombre}
        style={estilo}
        className="rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div
      style={estilo}
      className="rounded-full bg-[#EDE0C8] text-[#8a8471] font-bold flex items-center justify-center flex-shrink-0 text-sm"
    >
      {e.nombre.charAt(0).toUpperCase()}
    </div>
  );
}

export default function Empleados({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [empleados, setEmpleados] = useState([]);

  const puestosBase = PUESTOS_CATALOGO.filter((p) => p !== 'Otro');
  const puestosPersonalizados = [...new Set(empleados.map((e) => e.puesto).filter(Boolean))].filter(
    (p) => !puestosBase.includes(p)
  );
  const puestosDisponibles = [...puestosBase, ...puestosPersonalizados.sort(), 'Otro'];
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState('alfabetico'); // 'alfabetico' | 'sucursal'

  const [negocioSeleccionado, setNegocioSeleccionado] = useState('');
  const [nombreEmpleado, setNombreEmpleado] = useState('');
  const [puesto, setPuesto] = useState('');
  const [puestoCustom, setPuestoCustom] = useState('');
  const [telefonoEmpleado, setTelefonoEmpleado] = useState('');
  const [mailEmpleado, setMailEmpleado] = useState('');
  const [fotoBlob, setFotoBlob] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const fileInputCamaraRef = useRef(null);
  const fileInputGaleriaRef = useRef(null);

  const [creando, setCreando] = useState(false);
  const [ultimoCreado, setUltimoCreado] = useState(null);

  const [editandoId, setEditandoId] = useState(null);
  const [editForm, setEditForm] = useState({
    nombre: '',
    puesto: '',
    puestoCustom: '',
    telefono: '',
    mail: '',
    foto_url: null,
  });
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [editFotoBlob, setEditFotoBlob] = useState(null);
  const [editFotoPreview, setEditFotoPreview] = useState(null);
  const [editProcesandoFoto, setEditProcesandoFoto] = useState(false);
  const editFileInputCamaraRef = useRef(null);
  const editFileInputGaleriaRef = useRef(null);

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
        .select('*')
        .eq('cuenta_id', cuentaData.id)
        .order('nombre', { ascending: true });
      setNegocios(negociosData || []);

      const negocioIds = (negociosData || []).map((n) => n.id);
      if (negocioIds.length > 0) {
        const { data: empleadosData } = await supabase
          .from('empleados')
          .select('*')
          .in('negocio_id', negocioIds)
          .order('nombre', { ascending: true });
        setEmpleados(empleadosData || []);
      }
    }

    setLoading(false);
  }

  async function handleFotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setProcesandoFoto(true);
    try {
      const blob = await recortarACuadrado(file);
      setFotoBlob(blob);
      setFotoPreview(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
    }
    setProcesandoFoto(false);
  }

  async function handleCrearEmpleado(e) {
    e.preventDefault();
    if (!nombreEmpleado.trim() || !negocioSeleccionado) return;

    if (!hasAccess) {
      setMostrarSuscripcion(true);
      return;
    }

    setCreando(true);
    setUltimoCreado(null);

    let fotoUrl = null;
    if (fotoBlob) {
      const nombreArchivo = `${cuenta.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('fotos-empleados')
        .upload(nombreArchivo, fotoBlob, { contentType: 'image/jpeg' });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('fotos-empleados').getPublicUrl(nombreArchivo);
        fotoUrl = urlData.publicUrl;
      } else {
        console.error('No se pudo subir la foto:', uploadError);
      }
    }

    const { data, error } = await supabase
      .from('empleados')
      .insert({
        negocio_id: negocioSeleccionado,
        nombre: nombreEmpleado.trim(),
        puesto: (puesto === 'Otro' ? puestoCustom.trim() : puesto.trim()) || null,
        telefono: telefonoEmpleado.trim() || null,
        mail: mailEmpleado.trim() || null,
        foto_url: fotoUrl,
      })
      .select()
      .single();

    setCreando(false);
    if (error) {
      console.error(error);
      return;
    }

    setUltimoCreado(data.nombre);
    setNombreEmpleado('');
    setPuesto('');
    setPuestoCustom('');
    setTelefonoEmpleado('');
    setMailEmpleado('');
    setFotoBlob(null);
    setFotoPreview(null);
    setEmpleados([...empleados, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
  }

  async function handleBaja(empleadoId) {
    const confirmado = confirm(
      'Vas a dar de baja a este empleado. Se pierde el acceso a su información (progreso, cursos, historial). ¿Confirmás?'
    );
    if (!confirmado) return;

    const { error } = await supabase
      .from('empleados')
      .update({ fecha_baja: new Date().toISOString() })
      .eq('id', empleadoId);
    if (error) {
      console.error(error);
      return;
    }
    setEmpleados(
      empleados.map((e) => (e.id === empleadoId ? { ...e, fecha_baja: new Date().toISOString() } : e))
    );
  }

  function abrirEdicion(e) {
    if (editandoId === e.id) {
      setEditandoId(null);
      setEditFotoBlob(null);
      setEditFotoPreview(null);
      return;
    }
    setEditandoId(e.id);
    const puestoActual = e.puesto || '';
    const estaEnCatalogo = puestosDisponibles.includes(puestoActual);
    setEditForm({
      nombre: e.nombre || '',
      puesto: estaEnCatalogo ? puestoActual : puestoActual ? 'Otro' : '',
      puestoCustom: estaEnCatalogo ? '' : puestoActual,
      telefono: e.telefono || '',
      mail: e.mail || '',
      foto_url: e.foto_url || null,
    });
    setEditFotoBlob(null);
    setEditFotoPreview(e.foto_url || null);
  }

  async function handleEditFotoChange(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    setEditProcesandoFoto(true);
    try {
      const blob = await recortarACuadrado(file);
      setEditFotoBlob(blob);
      setEditFotoPreview(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
    }
    setEditProcesandoFoto(false);
  }

  async function handleGuardarEdicion(empleadoId) {
    if (!hasAccess) {
      setMostrarSuscripcion(true);
      return;
    }

    setGuardandoEdit(true);

    // Si eligió una foto nueva, la subimos igual que en el alta. Si no
    // tocó la foto, se mantiene la que ya tenía (editForm.foto_url).
    let fotoUrl = editForm.foto_url;
    if (editFotoBlob) {
      const nombreArchivo = `${cuenta.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('fotos-empleados')
        .upload(nombreArchivo, editFotoBlob, { contentType: 'image/jpeg' });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('fotos-empleados').getPublicUrl(nombreArchivo);
        fotoUrl = urlData.publicUrl;
      } else {
        console.error('No se pudo subir la foto:', uploadError);
      }
    }

    const puestoFinal = editForm.puesto === 'Otro' ? editForm.puestoCustom.trim() : editForm.puesto.trim();
    const { data, error } = await supabase
      .from('empleados')
      .update({
        nombre: editForm.nombre.trim(),
        puesto: puestoFinal || null,
        telefono: editForm.telefono.trim() || null,
        mail: editForm.mail.trim() || null,
        foto_url: fotoUrl,
      })
      .eq('id', empleadoId)
      .select()
      .single();

    setGuardandoEdit(false);
    if (error) {
      console.error(error);
      return;
    }
    setEmpleados(
      empleados.map((e) => (e.id === empleadoId ? data : e)).sort((a, b) => a.nombre.localeCompare(b.nombre))
    );
    setEditandoId(null);
    setEditFotoBlob(null);
    setEditFotoPreview(null);
  }

  function nombreNegocio(negocioId) {
    return negocios.find((n) => n.id === negocioId)?.nombre || '—';
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
  const activos = empleados.filter((e) => !e.fecha_baja);
  const dadosDeBaja = empleados.filter((e) => e.fecha_baja);

  function FilaEmpleado({ e }) {
    const abierto = editandoId === e.id;
    return (
      <div className="border-b border-[#EDE0C8] pb-2 last:border-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar e={e} />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[#2C2C2A]">{e.nombre}</p>
                {e.puesto && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#EDE0C8] text-[#C1502E] px-2 py-0.5 rounded-full">
                    {e.puesto}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8a8471]">
                {nombreNegocio(e.negocio_id)} · alta {new Date(e.fecha_alta).toLocaleDateString('es-AR')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => abrirEdicion(e)}
              title="Editar"
              className="w-8 h-8 rounded-full bg-[#EDE0C8] text-[#2C2C2A] flex items-center justify-center"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
              </svg>
            </button>
            <button
              onClick={() => handleBaja(e.id)}
              title="Dar de baja"
              className="w-8 h-8 rounded-full bg-[#C1502E] text-white flex items-center justify-center"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          </div>
        </div>

        {abierto && (
          <div className="mt-3 space-y-2 bg-[#EDE0C8] rounded-lg p-3">
            <div className="flex items-center gap-3 mb-1">
              <input
                type="file"
                accept="image/*"
                capture="user"
                ref={editFileInputCamaraRef}
                onChange={handleEditFotoChange}
                className="hidden"
              />
              <input
                type="file"
                accept="image/*"
                ref={editFileInputGaleriaRef}
                onChange={handleEditFotoChange}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center overflow-hidden flex-shrink-0 border-2 border-dashed border-[#C1502E]">
                {editFotoPreview ? (
                  <img src={editFotoPreview} alt="Foto" className="w-full h-full object-cover" />
                ) : (
                  <IconCamara className="text-[#C1502E]" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => editFileInputCamaraRef.current.click()}
                    disabled={editProcesandoFoto}
                    title="Tomar foto"
                    className="w-9 h-9 rounded-full bg-[#C1502E] text-white flex items-center justify-center disabled:opacity-60"
                  >
                    <IconCamara />
                  </button>
                  <button
                    type="button"
                    onClick={() => editFileInputGaleriaRef.current.click()}
                    disabled={editProcesandoFoto}
                    title="Elegir de galería"
                    className="w-9 h-9 rounded-full bg-white text-[#8a8471] flex items-center justify-center disabled:opacity-60"
                  >
                    <IconGaleria />
                  </button>
                </div>
                <span className="text-xs text-[#8a8471]">
                  {editProcesandoFoto ? 'Procesando...' : editFotoPreview ? 'Foto lista' : 'Foto opcional'}
                </span>
              </div>
            </div>
            <input
              type="text"
              value={editForm.nombre}
              onChange={(ev) => setEditForm({ ...editForm, nombre: ev.target.value })}
              placeholder="Nombre"
              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
            />
            <select
              value={editForm.puesto}
              onChange={(ev) => setEditForm({ ...editForm, puesto: ev.target.value })}
              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
            >
              <option value="">Elegí el puesto</option>
              {puestosDisponibles.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {editForm.puesto === 'Otro' && (
              <input
                type="text"
                value={editForm.puestoCustom}
                onChange={(ev) => setEditForm({ ...editForm, puestoCustom: ev.target.value })}
                placeholder="Especificá el puesto"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
            )}
            <input
              type="tel"
              value={editForm.telefono}
              onChange={(ev) => setEditForm({ ...editForm, telefono: ev.target.value })}
              placeholder="Teléfono"
              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
            />
            <input
              type="email"
              value={editForm.mail}
              onChange={(ev) => setEditForm({ ...editForm, mail: ev.target.value })}
              placeholder="Mail"
              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleGuardarEdicion(e.id)}
                disabled={guardandoEdit}
                className="text-xs font-semibold text-white bg-[#2C2C2A] rounded-full px-4 py-1.5 disabled:opacity-60"
              >
                {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                onClick={() => {
                  setEditandoId(null);
                  setEditFotoBlob(null);
                  setEditFotoPreview(null);
                }}
                className="text-xs font-semibold text-white bg-[#C1502E] rounded-full px-4 py-1.5"
              >
                Salir
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <PageShell>
        <EstadoBar
          icon={IconEmpleadosMini}
          label="Empleados"
          right={
            <span className="w-7 h-7 rounded-full bg-[#C1502E] text-white font-bold text-sm flex items-center justify-center">
              {empleados.length}
            </span>
          }
        />
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h2 className="font-semibold text-[#2C2C2A] mb-3">Dar de alta un empleado</h2>

          {negocios.length === 0 ? (
            <p className="text-sm text-[#6b6455]">
              Primero cargá al menos una sucursal, en la pantalla de Sucursales.
            </p>
          ) : (
            <form onSubmit={handleCrearEmpleado} className="space-y-2">
              <div className="flex items-center gap-3 mb-1">
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  ref={fileInputCamaraRef}
                  onChange={handleFotoChange}
                  className="hidden"
                />
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputGaleriaRef}
                  onChange={handleFotoChange}
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-full bg-[#EDE0C8] flex items-center justify-center overflow-hidden flex-shrink-0 border-2 border-dashed border-[#C1502E]">
                  {fotoPreview ? (
                    <img src={fotoPreview} alt="Foto" className="w-full h-full object-cover" />
                  ) : (
                    <IconCamara className="text-[#C1502E]" />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputCamaraRef.current.click()}
                      disabled={procesandoFoto}
                      title="Tomar foto"
                      className="w-9 h-9 rounded-full bg-[#C1502E] text-white flex items-center justify-center disabled:opacity-60"
                    >
                      <IconCamara />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputGaleriaRef.current.click()}
                      disabled={procesandoFoto}
                      title="Elegir de galería"
                      className="w-9 h-9 rounded-full bg-[#EDE0C8] text-[#8a8471] flex items-center justify-center disabled:opacity-60"
                    >
                      <IconGaleria />
                    </button>
                  </div>
                  <span className="text-xs text-[#8a8471]">
                    {procesandoFoto ? 'Procesando...' : fotoPreview ? 'Foto lista' : 'Foto opcional'}
                  </span>
                </div>
              </div>
              <select
                value={negocioSeleccionado}
                onChange={(e) => setNegocioSeleccionado(e.target.value)}
                onInvalid={validarCampo}
                onInput={limpiarValidacion}
                required
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="">Elegí la sucursal</option>
                {negocios.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nombre}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                value={nombreEmpleado}
                onChange={(e) => setNombreEmpleado(e.target.value)}
                onInvalid={validarCampo}
                onInput={limpiarValidacion}
                placeholder="Nombre del empleado"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <select
                required
                value={puesto}
                onChange={(e) => setPuesto(e.target.value)}
                onInvalid={validarCampo}
                onInput={limpiarValidacion}
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="">Elegí el puesto</option>
                {puestosDisponibles.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {puesto === 'Otro' && (
                <input
                  type="text"
                  required
                  value={puestoCustom}
                  onChange={(e) => setPuestoCustom(e.target.value)}
                  onInvalid={validarCampo}
                  onInput={limpiarValidacion}
                  placeholder="Especificá el puesto"
                  className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
                />
              )}
              <input
                type="tel"
                value={telefonoEmpleado}
                onChange={(e) => setTelefonoEmpleado(e.target.value)}
                placeholder="Teléfono"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <input
                type="email"
                value={mailEmpleado}
                onChange={(e) => setMailEmpleado(e.target.value)}
                onInvalid={validarCampo}
                onInput={limpiarValidacion}
                placeholder="Mail"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={
                  creando ||
                  !negocioSeleccionado ||
                  !nombreEmpleado.trim() ||
                  !puesto ||
                  (puesto === 'Otro' && !puestoCustom.trim())
                }
                className="w-full py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:bg-[#EFDDCE] disabled:text-[#8a8471]"
              >
                {creando ? 'Creando...' : 'Dar de alta'}
              </button>
            </form>
          )}

          {ultimoCreado && (
            <div className="mt-4 bg-[#EDE0C8] border border-[#EFDDCE] rounded-lg p-3 text-sm">
              <p className="text-[#2C2C2A] font-semibold">{ultimoCreado} fue dado de alta.</p>
              <p className="text-[10px] text-[#8a8471] mt-1">
                El link y el PIN de acceso los encontrás en{' '}
                <a href="/progreso" className="underline text-[#C1502E]">
                  Progreso
                </a>
                , mientras tenga cursos pendientes.
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[#2C2C2A]">Empleados activos ({activos.length})</h2>
            <div className="flex gap-1 bg-[#EDE0C8] rounded-lg p-1">
              <button
                onClick={() => setVista('alfabetico')}
                className={`text-xs font-semibold px-3 py-1 rounded-md ${
                  vista === 'alfabetico' ? 'bg-white text-[#2C2C2A]' : 'text-[#8a8471]'
                }`}
              >
                A-Z
              </button>
              <button
                onClick={() => setVista('sucursal')}
                className={`text-xs font-semibold px-3 py-1 rounded-md ${
                  vista === 'sucursal' ? 'bg-white text-[#2C2C2A]' : 'text-[#8a8471]'
                }`}
              >
                Por sucursal
              </button>
            </div>
          </div>

          {activos.length === 0 ? (
            <p className="text-sm text-[#6b6455]">Todavía no diste de alta a nadie.</p>
          ) : vista === 'alfabetico' ? (
            <div className="space-y-2">
              {activos.map((e) => (
                <FilaEmpleado key={e.id} e={e} />
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {negocios.map((n) => {
                const deEstaSucursal = activos.filter((e) => e.negocio_id === n.id);
                if (deEstaSucursal.length === 0) return null;
                return (
                  <div key={n.id}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-2">
                      {n.nombre}
                    </p>
                    <div className="space-y-2">
                      {deEstaSucursal.map((e) => (
                        <FilaEmpleado key={e.id} e={e} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {dadosDeBaja.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#8a8471] mb-3">Dados de baja ({dadosDeBaja.length})</h2>
            <div className="space-y-2">
              {dadosDeBaja.map((e) => (
                <div key={e.id} className="flex items-center gap-3 border-b border-[#EDE0C8] pb-2 last:border-0">
                  <Avatar e={e} size={28} />
                  <div className="flex-1 flex items-center justify-between">
                    <p className="text-sm text-[#8a8471]">{e.nombre}</p>
                    <p className="text-xs text-[#8a8471]">baja {new Date(e.fecha_baja).toLocaleDateString('es-AR')}</p>
                  </div>
                </div>
              ))}
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
