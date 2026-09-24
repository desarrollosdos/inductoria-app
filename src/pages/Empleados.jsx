import { Fragment, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import SuscripcionRequeridaModal from '../components/SuscripcionRequeridaModal';
import TrialBanner from '../components/TrialBanner';
import { tieneAccesoBase } from '../lib/acceso';
import { capitalizarPalabras } from '../lib/texto';

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

// Tope de empleados activos, agregado 2026-09-05 a pedido de Roberto
// para que no se pueda cargar una cantidad de empleados que no
// corresponda a lo que la cuenta tiene contratado (algo que hasta
// ahora no tenía ningún límite, a diferencia de sucursales que sí
// respeta sucursales_contratadas). Igual que en Trainual/BambooHR, el
// tope escala con el plan contratado en vez de ser un número fijo para
// todos: 20 empleados activos por cada sucursal contratada. Para un
// negocio chico (indumentaria, estética, kiosco, panadería, 2 a 10
// empleados típico por local) esto nunca se llega a rozar; lo que
// evita es que una cuenta de 1 sucursal cargue cientos de empleados
// gratis. Aplica siempre (activa, trial, lo que sea), no solo cuando
// falta pago — es un tope de uso apropiado, no una restricción de
// suscripción. Ajustable acá si en la práctica el número queda corto o
// largo.
const EMPLEADOS_POR_SUCURSAL = 20;

function limiteEmpleados(cuenta) {
  return (cuenta?.sucursales_contratadas || 1) * EMPLEADOS_POR_SUCURSAL;
}

function IconWhatsApp(props) {
  return (
    <svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" {...props}>
      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
    </svg>
  );
}

// Mismo criterio que en Progreso.jsx: si el teléfono no viene ya con el
// 54 de Argentina adelante, se le agrega junto con el 9 que WhatsApp
// espera para celulares argentinos.
function formatoWhatsApp(telefono) {
  const soloDigitos = (telefono || '').replace(/\D/g, '');
  if (!soloDigitos) return null;
  return soloDigitos.startsWith('54') ? soloDigitos : `549${soloDigitos}`;
}

// Link corto (/e?c=...) que redirige al link real del empleado. Mismo
// formato que usa Progreso.jsx.
function linkAccesoEmpleado(empleado) {
  if (!empleado?.token_acceso) return null;
  return `${window.location.origin}/e?c=${empleado.token_acceso.slice(0, 10)}`;
}

// Mensaje listo para mandar por WhatsApp o pegar donde sea. El mismo
// texto en el botón de copiar y en el de WhatsApp.
function mensajeAccesoEmpleado(empleado) {
  const link = linkAccesoEmpleado(empleado);
  if (!link) return null;
  return `¡Hola ${empleado.nombre}! Entrá a este link para hacer tus cursos: ${link} Tu PIN es ${empleado.pin}.`;
}

// PIN nuevo de 4 cifras con el generador seguro del navegador (no
// Math.random, que es predecible). La primera cifra va de 1 a 9: si la
// columna pin fuera numérica, un PIN que empieza con 0 se guardaría con 3
// cifras y el empleado no podría entrar.
function generarPinAleatorio() {
  const valores = new Uint32Array(4);
  crypto.getRandomValues(valores);
  const primera = 1 + (valores[0] % 9);
  const resto = Array.from(valores.slice(1), (v) => v % 10).join('');
  return `${primera}${resto}`;
}

// Copia al portapapeles. navigator.clipboard necesita https y a veces no
// está (navegadores viejos o dentro de otra app); ahí se usa el método
// viejo con un textarea escondido.
async function copiarAlPortapapeles(texto) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // sigue con el método viejo
  }
  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function IconLlave(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 9.8-9.8" />
      <path d="m16 7 3 3" />
      <path d="m14 9 2 2" />
    </svg>
  );
}

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

// Persona con un "+": botón para desplegar el alta (2026-09-06, a
// pedido de Roberto, para no mostrar siempre todo el formulario).
function IconPersonaMas(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <line x1="17.5" y1="7" x2="17.5" y2="13" />
      <line x1="14.5" y1="10" x2="20.5" y2="10" />
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

function IconChevron(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// Dropdown propio, mismo estilo que el resto de los inputs, para no
// depender del <select> nativo del navegador (2026-09-06, a pedido de
// Roberto: "elegí la sucursal" y "elegí el puesto" abrían el listado
// con el estilo nativo del sistema operativo, distinto al resto de la
// app). Cierra solo al elegir una opción o al tocar afuera.
function SelectPersonalizado({ value, onChange, opciones, placeholder }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    function handleClickAfuera(ev) {
      if (contenedorRef.current && !contenedorRef.current.contains(ev.target)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', handleClickAfuera);
    document.addEventListener('touchstart', handleClickAfuera);
    return () => {
      document.removeEventListener('mousedown', handleClickAfuera);
      document.removeEventListener('touchstart', handleClickAfuera);
    };
  }, [abierto]);

  const seleccionado = opciones.find((o) => o.value === value);

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between gap-2 border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm bg-white text-left"
      >
        <span className={seleccionado ? 'text-[#2C2C2A]' : 'text-[#8a8471]'}>
          {seleccionado ? seleccionado.label : placeholder}
        </span>
        <IconChevron
          className={`text-[#8a8471] flex-shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}
        />
      </button>
      {abierto && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-[#EFDDCE] rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {opciones.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setAbierto(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[#FDF6ED] ${
                o.value === value ? 'text-[#C1502E] font-semibold' : 'text-[#2C2C2A]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
  // ids de empleados con al menos un curso realizado (progreso_empleado.completado = true).
  // Se usa para no contar como "dados de baja" a quienes fueron borrados sin ninguna
  // actividad (por ejemplo, mientras se los daba de alta y hubo que borrarlos).
  const [empleadosConCursoRealizado, setEmpleadosConCursoRealizado] = useState(new Set());

  const puestosBase = PUESTOS_CATALOGO.filter((p) => p !== 'Otro');
  const puestosPersonalizados = [...new Set(empleados.map((e) => e.puesto).filter(Boolean))].filter(
    (p) => !puestosBase.includes(p)
  );
  const puestosDisponibles = [...puestosBase, ...puestosPersonalizados.sort(), 'Otro'];
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState('alfabetico'); // 'alfabetico' | 'sucursal'

  // Formulario de alta colapsado detrás de un botón (2026-09-06, a
  // pedido de Roberto: antes el formulario completo estaba siempre
  // abierto arriba de la lista de activos).
  const [mostrandoFormAlta, setMostrandoFormAlta] = useState(false);

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
  const [errorCupoEmpleados, setErrorCupoEmpleados] = useState(null);

  // Confirmación propia (mismo look que Dashboard.jsx al agregar una
  // sucursal) en vez de window.confirm nativo, que sale con letra negra
  // estándar del navegador (2026-09-06, a pedido de Roberto).
  const [confirmandoBajaId, setConfirmandoBajaId] = useState(null);

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

  // Antes, si fallaba el alta, la baja, la edición o la subida de la
  // foto, el error quedaba solo en la consola y en pantalla no pasaba
  // nada. Ahora cada uno se muestra donde se hizo la acción.
  const [errorAlta, setErrorAlta] = useState(null);
  const [errorEdicion, setErrorEdicion] = useState(null);
  const [errorGeneral, setErrorGeneral] = useState(null);

  // Panel de "link y PIN" de cada empleado activo. Antes solo se podía
  // mandar justo después del alta o desde Progreso mientras tuviera
  // cursos pendientes; ahora se abre desde su fila cuando haga falta.
  const [accesoAbiertoId, setAccesoAbiertoId] = useState(null);
  const [copiadoId, setCopiadoId] = useState(null);
  const [confirmandoPinId, setConfirmandoPinId] = useState(null);
  const [generandoPinId, setGenerandoPinId] = useState(null);
  const [errorAcceso, setErrorAcceso] = useState(null); // { id, mensaje }

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

        const empleadoIds = (empleadosData || []).map((e) => e.id);
        if (empleadoIds.length > 0) {
          const { data: progresoData } = await supabase
            .from('progreso_empleado')
            .select('empleado_id, completado')
            .in('empleado_id', empleadoIds)
            .eq('completado', true);
          setEmpleadosConCursoRealizado(new Set((progresoData || []).map((p) => p.empleado_id)));
        } else {
          setEmpleadosConCursoRealizado(new Set());
        }
      }
    }

    setLoading(false);
  }

  async function handleFotoChange(e) {
    const file = e.target.files[0];
    // Se limpia el input para que elegir la misma foto de nuevo vuelva a
    // disparar el cambio.
    e.target.value = '';
    if (!file) return;
    setProcesandoFoto(true);
    setErrorAlta(null);
    try {
      const blob = await recortarACuadrado(file);
      if (!blob) throw new Error('sin blob');
      setFotoBlob(blob);
      setFotoPreview(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setErrorAlta('No se pudo leer esa foto. Probá con otra.');
    }
    setProcesandoFoto(false);
  }

  function cancelarAlta() {
    setMostrandoFormAlta(false);
    setNegocioSeleccionado('');
    setNombreEmpleado('');
    setPuesto('');
    setPuestoCustom('');
    setTelefonoEmpleado('');
    setMailEmpleado('');
    setFotoBlob(null);
    setFotoPreview(null);
    setErrorCupoEmpleados(null);
    setErrorAlta(null);
  }

  async function handleCrearEmpleado(e) {
    e.preventDefault();
    if (!nombreEmpleado.trim() || !negocioSeleccionado || !telefonoEmpleado.trim()) return;

    if (!hasAccess) {
      setMostrarSuscripcion(true);
      return;
    }

    // Tope de empleados activos según lo contratado (ver
    // EMPLEADOS_POR_SUCURSAL arriba). Chequeo defensivo acá además del
    // que oculta el formulario más abajo, por si hay dos pestañas
    // abiertas a la vez.
    setErrorCupoEmpleados(null);
    const activosActuales = empleados.filter((emp) => !emp.fecha_baja).length;
    if (activosActuales >= limiteEmpleados(cuenta)) {
      setErrorCupoEmpleados(
        `Llegaste al límite de ${limiteEmpleados(cuenta)} empleados activos de tu plan. Escribinos si necesitás sumar más.`
      );
      return;
    }

    setCreando(true);
    setUltimoCreado(null);
    setErrorAlta(null);

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
        // Frenamos acá (sin crear al empleado) para que no quede cargado
        // sin foto sin que el dueño se entere.
        console.error('No se pudo subir la foto:', uploadError);
        setErrorAlta('No se pudo subir la foto. Probá de nuevo, o sacala y dalo de alta sin foto.');
        setCreando(false);
        return;
      }
    }

    const { data, error } = await supabase
      .from('empleados')
      .insert({
        negocio_id: negocioSeleccionado,
        nombre: capitalizarPalabras(nombreEmpleado.trim()),
        puesto: (puesto === 'Otro' ? capitalizarPalabras(puestoCustom.trim()) : puesto.trim()) || null,
        telefono: telefonoEmpleado.trim() || null,
        mail: mailEmpleado.trim() || null,
        foto_url: fotoUrl,
      })
      .select()
      .single();

    setCreando(false);
    if (error || !data) {
      console.error(error);
      setErrorAlta('No se pudo dar de alta al empleado. Revisá tu conexión y probá de nuevo.');
      return;
    }

    setUltimoCreado(data);
    setNombreEmpleado('');
    setPuesto('');
    setPuestoCustom('');
    setTelefonoEmpleado('');
    setMailEmpleado('');
    setFotoBlob(null);
    setFotoPreview(null);
    setMostrandoFormAlta(false);
    setEmpleados([...empleados, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
  }

  async function handleBaja(empleadoId) {
    setConfirmandoBajaId(null);
    setErrorGeneral(null);

    const fechaBaja = new Date().toISOString();
    const { error } = await supabase
      .from('empleados')
      .update({ fecha_baja: fechaBaja })
      .eq('id', empleadoId);
    if (error) {
      console.error(error);
      setErrorGeneral('No se pudo dar de baja al empleado. Probá de nuevo.');
      return;
    }
    setEmpleados(empleados.map((e) => (e.id === empleadoId ? { ...e, fecha_baja: fechaBaja } : e)));
  }

  function toggleAcceso(empleadoId) {
    setAccesoAbiertoId(accesoAbiertoId === empleadoId ? null : empleadoId);
    setConfirmandoPinId(null);
    setErrorAcceso(null);
    setCopiadoId(null);
  }

  async function handleCopiarMensaje(empleado) {
    const mensaje = mensajeAccesoEmpleado(empleado);
    if (!mensaje) return;
    const ok = await copiarAlPortapapeles(mensaje);
    if (ok) {
      setErrorAcceso(null);
      setCopiadoId(empleado.id);
      setTimeout(() => setCopiadoId((actual) => (actual === empleado.id ? null : actual)), 2500);
    } else {
      setErrorAcceso({ id: empleado.id, mensaje: 'No se pudo copiar. Mantené apretado el mensaje de abajo para copiarlo a mano.' });
    }
  }

  // No existía forma de cambiar el PIN: si un empleado lo perdía o se lo
  // pasaba a otro, había que darlo de baja y de alta de nuevo.
  async function handleGenerarPin(empleado) {
    setConfirmandoPinId(null);
    setErrorAcceso(null);
    setGenerandoPinId(empleado.id);
    const pinNuevo = generarPinAleatorio();
    const { data, error } = await supabase
      .from('empleados')
      // También se destraba si estaba bloqueado por PIN mal puesto
      // (columnas de supabase/sql/2026-09-24-empleados-seguridad.sql).
      .update({ pin: pinNuevo, pin_intentos_fallidos: 0, pin_bloqueado_hasta: null })
      .eq('id', empleado.id)
      .select()
      .single();
    setGenerandoPinId(null);
    if (error || !data) {
      console.error(error);
      setErrorAcceso({ id: empleado.id, mensaje: 'No se pudo cambiar el PIN. Probá de nuevo.' });
      return;
    }
    setEmpleados(empleados.map((e) => (e.id === empleado.id ? data : e)));
    if (ultimoCreado?.id === empleado.id) setUltimoCreado(data);
  }

  function abrirEdicion(e) {
    if (editandoId === e.id) {
      setEditandoId(null);
      setEditFotoBlob(null);
      setEditFotoPreview(null);
      return;
    }
    setEditandoId(e.id);
    setErrorEdicion(null);
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
    ev.target.value = '';
    if (!file) return;
    setEditProcesandoFoto(true);
    setErrorEdicion(null);
    try {
      const blob = await recortarACuadrado(file);
      if (!blob) throw new Error('sin blob');
      setEditFotoBlob(blob);
      setEditFotoPreview(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setErrorEdicion('No se pudo leer esa foto. Probá con otra.');
    }
    setEditProcesandoFoto(false);
  }

  async function handleGuardarEdicion(empleadoId) {
    if (!hasAccess) {
      setMostrarSuscripcion(true);
      return;
    }

    setGuardandoEdit(true);
    setErrorEdicion(null);

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
        setErrorEdicion('No se pudo subir la foto nueva. Probá de nuevo.');
        setGuardandoEdit(false);
        return;
      }
    }

    const puestoFinal = editForm.puesto === 'Otro' ? capitalizarPalabras(editForm.puestoCustom.trim()) : editForm.puesto.trim();
    const { data, error } = await supabase
      .from('empleados')
      .update({
        nombre: capitalizarPalabras(editForm.nombre.trim()),
        puesto: puestoFinal || null,
        telefono: editForm.telefono.trim() || null,
        mail: editForm.mail.trim() || null,
        foto_url: fotoUrl,
      })
      .eq('id', empleadoId)
      .select()
      .single();

    setGuardandoEdit(false);
    if (error || !data) {
      console.error(error);
      setErrorEdicion('No se pudieron guardar los cambios. Revisá tu conexión y probá de nuevo.');
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
    return negocios.find((n) => n.id === negocioId)?.nombre || 'Sin sucursal';
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
  const activos = empleados.filter((e) => !e.fecha_baja);
  // Solo cuentan como "dados de baja" quienes tienen al menos un curso realizado.
  // Así se excluye a quienes se borraron sin ninguna actividad (p. ej. de baja
  // durante el alta, por error, sin haber llegado a usar la app).
  const dadosDeBaja = empleados.filter((e) => e.fecha_baja && empleadosConCursoRealizado.has(e.id));
  const topeEmpleados = limiteEmpleados(cuenta);
  const limiteEmpleadosAlcanzado = activos.length >= topeEmpleados;

  // Se llama como función (FilaEmpleado({ e })) y no como <FilaEmpleado />:
  // al estar definida adentro del componente, como etiqueta React la
  // desmontaba en cada tecla y los inputs de edición perdían el foco.
  function FilaEmpleado({ e }) {
    const abierto = editandoId === e.id;
    const accesoAbierto = accesoAbiertoId === e.id;
    const mensaje = mensajeAccesoEmpleado(e);
    const telefonoWa = formatoWhatsApp(e.telefono);
    return (
      <div className="border-b border-[#EDE0C8] pb-2 last:border-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar e={e} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#2C2C2A] break-words">{e.nombre}</p>
              {e.puesto && (
                <span
                  className="text-[10px] font-bold uppercase tracking-wide bg-[#6B655A] text-white px-2 py-0.5 rounded-full inline-block mt-0.5"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                >
                  {e.puesto}
                </span>
              )}
              <p className="text-xs text-[#8a8471] mt-0.5">
                <span className="font-semibold tracking-wide text-[#6b6455]">{nombreNegocio(e.negocio_id)}</span> · alta {new Date(e.fecha_alta).toLocaleDateString('es-AR')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => toggleAcceso(e.id)}
              title="Link y PIN"
              aria-label="Ver link y PIN"
              className="w-8 h-8 rounded-full bg-[#7C8B6F] text-white flex items-center justify-center"
            >
              <IconLlave />
            </button>
            <button
              type="button"
              onClick={() => abrirEdicion(e)}
              title="Editar"
              aria-label="Editar"
              className="w-8 h-8 rounded-full bg-[#6B655A] text-white flex items-center justify-center"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setConfirmandoBajaId(e.id)}
              title="Dar de baja"
              aria-label="Dar de baja"
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

        {confirmandoBajaId === e.id && (
          <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455] space-y-2 mt-2">
            <p className="font-semibold text-[#2C2C2A]">
              Va a dejar de ver sus cursos y su progreso. ¿Lo das de baja?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmandoBajaId(null)}
                className="flex-1 py-2 rounded-lg font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleBaja(e.id)}
                className="flex-1 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]"
                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
              >
                Sí, dar de baja
              </button>
            </div>
          </div>
        )}

        {accesoAbierto && (
          <div className="mt-2 bg-[#F3F9F5] border border-[#BFE0CE] rounded-lg p-3 text-sm text-[#2C4A3A] space-y-2">
            {mensaje ? (
              <>
                <p className="text-xs font-semibold">Link y PIN para mandarle:</p>
                <p className="text-xs bg-white border border-[#BFE0CE] rounded-lg px-3 py-2 break-words select-all">
                  {mensaje}
                </p>
                <p className="text-xs">
                  PIN: <span className="font-bold text-[#C1502E]">{e.pin}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopiarMensaje(e)}
                    className="min-h-[40px] text-xs font-bold tracking-wide text-white bg-[#4A453D] rounded-full px-4 py-2"
                    style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                  >
                    {copiadoId === e.id ? '¡Copiado!' : 'Copiar mensaje'}
                  </button>
                  {telefonoWa && (
                    <a
                      href={`https://wa.me/${telefonoWa}?text=${encodeURIComponent(mensaje)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-white bg-[#7C8B6F] rounded-full px-4 py-2"
                      style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                    >
                      <IconWhatsApp />
                      Enviar por WhatsApp
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmandoPinId(e.id)}
                    disabled={generandoPinId === e.id}
                    className="min-h-[40px] text-xs font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8] rounded-full px-4 py-2 disabled:opacity-60"
                  >
                    {generandoPinId === e.id ? 'Generando...' : 'Generar PIN nuevo'}
                  </button>
                </div>
                {confirmandoPinId === e.id && (
                  <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455] space-y-2">
                    <p className="font-semibold text-[#2C2C2A]">
                      El PIN de ahora deja de funcionar y vas a tener que mandarle el nuevo. ¿Lo cambiás?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmandoPinId(null)}
                        className="flex-1 py-2 rounded-lg font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGenerarPin(e)}
                        className="flex-1 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]"
                        style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                      >
                        Sí, cambiarlo
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs">Este empleado todavía no tiene link. Recargá la página y probá de nuevo.</p>
            )}
            {errorAcceso?.id === e.id && (
              <p className="text-xs font-semibold text-[#C1502E]">{errorAcceso.mensaje}</p>
            )}
          </div>
        )}

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
            <SelectPersonalizado
              value={editForm.puesto}
              onChange={(val) => setEditForm({ ...editForm, puesto: val })}
              placeholder="Elegí el puesto"
              opciones={puestosDisponibles.map((p) => ({ value: p, label: p }))}
            />
            {editForm.puesto === 'Otro' && (
              <input
                type="text"
                value={editForm.puestoCustom}
                onChange={(ev) => setEditForm({ ...editForm, puestoCustom: ev.target.value })}
                placeholder="Escribí el puesto"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
            )}
            <input
              type="tel"
              required
              value={editForm.telefono}
              onChange={(ev) => setEditForm({ ...editForm, telefono: ev.target.value })}
              onInvalid={validarCampo}
              onInput={limpiarValidacion}
              placeholder="Teléfono"
              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
            />
            <input
              type="email"
              value={editForm.mail}
              onChange={(ev) => setEditForm({ ...editForm, mail: ev.target.value })}
              placeholder="Mail (opcional)"
              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
            />
            {errorEdicion && <p className="text-xs font-semibold text-[#C1502E]">{errorEdicion}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleGuardarEdicion(e.id)}
                disabled={guardandoEdit || !editForm.telefono.trim()}
                className="text-xs font-bold tracking-wide text-white bg-[#2C2C2A] rounded-full px-4 py-1.5 disabled:opacity-60"
                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
              >
                {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditandoId(null);
                  setEditFotoBlob(null);
                  setEditFotoPreview(null);
                }}
                className="text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-4 py-1.5"
                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
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
        <TrialBanner cuenta={cuenta} />
        <EstadoBar
          icon={IconEmpleadosMini}
          label="Empleados"
          right={
            <span className="w-7 h-7 rounded-full bg-[#C1502E] text-white font-bold text-sm flex items-center justify-center">
              {activos.length}
            </span>
          }
        />
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          {negocios.length === 0 ? (
            <p className="text-sm text-[#6b6455]">
              Primero cargá al menos una sucursal, en la pantalla de Sucursales.
            </p>
          ) : limiteEmpleadosAlcanzado ? (
            <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-lg p-3 text-sm text-[#2C4A3A] font-semibold tracking-wide">
              Llegaste al límite de {topeEmpleados} empleados activos de tu plan. Escribinos si
              necesitás sumar más.
            </div>
          ) : !mostrandoFormAlta ? (
            <button
              type="button"
              onClick={() => setMostrandoFormAlta(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-bold tracking-wide text-white bg-[#C1502E]"
              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
            >
              <IconPersonaMas width="26" height="26" />
              Sumar empleado
            </button>
          ) : (
            <form onSubmit={handleCrearEmpleado} className="space-y-2">
              {errorCupoEmpleados && <p className="text-xs text-[#C1502E]">{errorCupoEmpleados}</p>}
              {errorAlta && <p className="text-xs font-semibold text-[#C1502E]">{errorAlta}</p>}
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
              <SelectPersonalizado
                value={negocioSeleccionado}
                onChange={setNegocioSeleccionado}
                placeholder="Elegí la sucursal"
                opciones={negocios.map((n) => ({ value: n.id, label: n.nombre }))}
              />
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
              <SelectPersonalizado
                value={puesto}
                onChange={setPuesto}
                placeholder="Elegí el puesto"
                opciones={puestosDisponibles.map((p) => ({ value: p, label: p }))}
              />
              {puesto === 'Otro' && (
                <input
                  type="text"
                  required
                  value={puestoCustom}
                  onChange={(e) => setPuestoCustom(e.target.value)}
                  onInvalid={validarCampo}
                  onInput={limpiarValidacion}
                  placeholder="Escribí el puesto"
                  className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
                />
              )}
              <input
                type="tel"
                required
                value={telefonoEmpleado}
                onChange={(e) => setTelefonoEmpleado(e.target.value)}
                onInvalid={validarCampo}
                onInput={limpiarValidacion}
                placeholder="Teléfono"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <input
                type="email"
                value={mailEmpleado}
                onChange={(e) => setMailEmpleado(e.target.value)}
                onInvalid={validarCampo}
                onInput={limpiarValidacion}
                placeholder="Mail (opcional)"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelarAlta}
                  className="flex-1 py-2 rounded-lg text-xs font-bold tracking-wide text-white bg-[#6B655A]"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    creando ||
                    !negocioSeleccionado ||
                    !nombreEmpleado.trim() ||
                    !puesto ||
                    (puesto === 'Otro' && !puestoCustom.trim()) ||
                    !telefonoEmpleado.trim()
                  }
                  className="flex-1 py-2 rounded-lg text-xs font-bold tracking-wide text-white bg-[#C1502E] disabled:bg-[#EFDDCE] disabled:text-[#8a8471]"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                >
                  {creando ? 'Creando...' : 'Dar de alta'}
                </button>
              </div>
            </form>
          )}

          {ultimoCreado && (
            <div className="mt-4 bg-[#EDE0C8] border border-[#EFDDCE] rounded-lg p-3 text-sm space-y-2">
              <p className="text-[#2C2C2A] font-semibold">Listo, {ultimoCreado.nombre} ya está cargado.</p>
              {mensajeAccesoEmpleado(ultimoCreado) && (
                <>
                  <p className="text-xs text-[#3d382c] bg-white rounded-lg px-3 py-2 break-words select-all">
                    {mensajeAccesoEmpleado(ultimoCreado)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopiarMensaje(ultimoCreado)}
                      className="min-h-[40px] text-xs font-bold tracking-wide text-white bg-[#4A453D] rounded-full px-4 py-2"
                      style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                    >
                      {copiadoId === ultimoCreado.id ? '¡Copiado!' : 'Copiar mensaje'}
                    </button>
                    {formatoWhatsApp(ultimoCreado.telefono) && (
                      <a
                        href={`https://wa.me/${formatoWhatsApp(ultimoCreado.telefono)}?text=${encodeURIComponent(
                          mensajeAccesoEmpleado(ultimoCreado)
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[40px] inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-white bg-[#7C8B6F] rounded-full px-4 py-2"
                        style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                      >
                        <IconWhatsApp />
                        Enviar por WhatsApp
                      </a>
                    )}
                  </div>
                  {errorAcceso?.id === ultimoCreado.id && (
                    <p className="text-xs font-semibold text-[#C1502E]">{errorAcceso.mensaje}</p>
                  )}
                </>
              )}
              <p className="text-xs text-[#8a8471]">
                Si lo necesitás más adelante, tocá el botón verde con la llave en su fila para ver
                el link y el PIN de nuevo.
              </p>
            </div>
          )}
        </div>

        {errorGeneral && (
          <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm font-semibold text-[#C1502E]">
            {errorGeneral}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h2 className="font-semibold text-[#2C2C2A]">Activos {activos.length}</h2>
            <div className="flex gap-1 bg-[#EDE0C8] rounded-lg p-1">
              <button
                onClick={() => setVista('alfabetico')}
                className={`text-xs font-bold tracking-wide px-3 py-1 rounded-md ${
                  vista === 'alfabetico' ? 'bg-white text-[#2C2C2A]' : 'text-[#8a8471]'
                }`}
              >
                A-Z
              </button>
              <button
                onClick={() => setVista('sucursal')}
                className={`text-xs font-bold tracking-wide px-3 py-1 rounded-md ${
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
                <Fragment key={e.id}>{FilaEmpleado({ e })}</Fragment>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {negocios.map((n) => {
                const deEstaSucursal = activos.filter((e) => e.negocio_id === n.id);
                if (deEstaSucursal.length === 0) return null;
                return (
                  <div key={n.id}>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#C1502E] mb-2">
                      {n.nombre}
                    </p>
                    <div className="space-y-2">
                      {deEstaSucursal.map((e) => (
                        <Fragment key={e.id}>{FilaEmpleado({ e })}</Fragment>
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
            <h2 className="font-semibold text-[#8a8471] mb-3 flex items-center gap-2">
              Dados de baja
              <span className="w-6 h-6 rounded-full bg-[#C1502E] text-white font-bold text-xs flex items-center justify-center">
                {dadosDeBaja.length}
              </span>
            </h2>
            <div className="space-y-2">
              {dadosDeBaja.map((e) => (
                <div key={e.id} className="flex items-center gap-3 border-b border-[#EDE0C8] pb-2 last:border-0">
                  <Avatar e={e} size={28} />
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm text-[#8a8471] break-words">{e.nombre}</p>
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
