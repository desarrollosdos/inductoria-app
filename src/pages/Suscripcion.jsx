import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import PageShell from '../components/PageShell';
import CancelarSuscripcionModal from '../components/CancelarSuscripcionModal';
import { precioTotalMensual, PRECIO_BASE_POR_DEFECTO } from '../lib/precio';
import { trialActivo, textoTrialRestante, EMPLEADOS_POR_SUCURSAL } from '../lib/acceso';

function IconCard(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function IconAyuda(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.7V17h6v-1.5c0-.7.3-1.3.8-1.7A6.5 6.5 0 0 0 12 2z" />
      <path d="M9 19h6" fill="none" />
      <path d="M10 21.5h4" fill="none" />
    </svg>
  );
}

// Mismos 4 estados y mismos colores que ya usás en Repunte. "inactive"
// (cuenta vieja que nunca se suscribió, o prueba gratis vencida) y
// "trial" van con fondo suave, no una pastilla sólida como los otros 4,
// para que se lea distinto: todavía no es un problema de pago.
const ESTADOS = {
  inactive: {
    pillBg: '#FCE79A',
    pillText: '#C1502E',
    solido: false,
    corto: 'Inactiva',
    largo: 'Todavía no te suscribiste',
  },
  trial: {
    pillBg: '#DCEEF7',
    pillText: '#1B6E8C',
    solido: false,
    corto: 'Prueba gratis',
    largo: 'Estás en tu prueba gratis',
  },
  // Mismo verde salvia que ya usa el resto del sitio (el avatar del
  // header, los acentos de Admin).
  active: { pillBg: '#7C8B6F', pillText: '#fff', solido: true, corto: 'Activa', largo: 'Suscripción activa' },
  past_due: {
    pillBg: '#EF9F27',
    pillText: '#fff',
    solido: true,
    corto: 'Pago pendiente',
    largo: 'No pudimos cobrar tu suscripción',
  },
  suspended: {
    pillBg: '#7F77DD',
    pillText: '#fff',
    solido: true,
    corto: 'Suspendida',
    largo: 'Suscripción suspendida',
  },
  cancelled: {
    pillBg: '#E24B4A',
    pillText: '#fff',
    solido: true,
    corto: 'Cancelada',
    largo: 'Suscripción cancelada',
  },
};

// Marca de "me fui a pagar a MercadoPago". Se guarda al tocar el botón
// de pago y se usa al volver para esperar la confirmación del webhook,
// que puede tardar. Antes solo se esperaba si la cuenta estaba en
// 'inactive', así que alguien que pagaba desde la prueba gratis (o con el
// pago trabado) volvía y seguía viendo el estado viejo hasta refrescar.
const CLAVE_PAGO_PENDIENTE = 'inductoria_pago_pendiente';
const INTERVALO_ESPERA_MS = 5000;
const TOPE_ESPERA_MS = 2 * 60 * 1000;
// Una marca más vieja que esto ya no sirve (se fue a pagar y nunca
// volvió, por ejemplo).
const VIGENCIA_MARCA_MS = 60 * 60 * 1000;

function leerMarcaPago() {
  try {
    const raw = sessionStorage.getItem(CLAVE_PAGO_PENDIENTE);
    if (!raw) return null;
    const marca = JSON.parse(raw);
    if (!marca?.desde || Date.now() - marca.desde > VIGENCIA_MARCA_MS) {
      sessionStorage.removeItem(CLAVE_PAGO_PENDIENTE);
      return null;
    }
    return marca;
  } catch {
    return null;
  }
}

function guardarMarcaPago() {
  try {
    sessionStorage.setItem(CLAVE_PAGO_PENDIENTE, JSON.stringify({ desde: Date.now() }));
  } catch {
    // Sin sessionStorage igual se puede pagar; solo no esperamos al volver.
  }
}

function borrarMarcaPago() {
  try {
    sessionStorage.removeItem(CLAVE_PAGO_PENDIENTE);
  } catch {
    // nada
  }
}

function formatearFecha(fecha) {
  return fecha ? new Date(fecha).toLocaleDateString('es-AR') : null;
}

// La cuenta ya quedó paga y al día (lo que se espera después de pagar).
function estaAlDia(cuenta) {
  return !!cuenta && cuenta.plan === 'active' && !cuenta.cancelacion_pendiente;
}

async function leerCuenta(userId) {
  const { data } = await supabase.from('cuentas').select('*').eq('owner_id', userId).maybeSingle();
  return data;
}

export default function Suscripcion({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [precioBase, setPrecioBase] = useState(PRECIO_BASE_POR_DEFECTO);
  const [loading, setLoading] = useState(true);
  const [iniciandoPago, setIniciandoPago] = useState(false);
  // Aviso propio en vez de window.alert nativo, que sale con letra negra
  // estándar del navegador (2026-09-06, a pedido de Roberto).
  const [errorPago, setErrorPago] = useState(null);
  const [mostrarCancelar, setMostrarCancelar] = useState(false);
  // null | 'esperando' | 'listo' | 'demorado'
  const [esperaPago, setEsperaPago] = useState(null);
  // Se incrementa para (re)arrancar la espera, por ejemplo cuando el
  // navegador restaura la página desde memoria al tocar "atrás".
  const [intentoEspera, setIntentoEspera] = useState(0);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si volvés de MercadoPago con el botón "atrás" del navegador, a veces
  // Chrome restaura la página desde memoria (bfcache) en vez de recargarla,
  // y el botón se queda trabado diciendo "Redirigiendo..." para siempre.
  // Esto lo destraba, refresca el estado real de la cuenta y, si te
  // habías ido a pagar, vuelve a esperar la confirmación.
  useEffect(() => {
    function handlePageShow(event) {
      if (event.persisted) {
        setIniciandoPago(false);
        cargar();
        setIntentoEspera((n) => n + 1);
      }
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar() {
    setLoading(true);
    const cuentaData = await leerCuenta(session.user.id);
    setCuenta(cuentaData);

    if (cuentaData) {
      const { data: negociosData } = await supabase
        .from('negocios')
        .select('id')
        .eq('cuenta_id', cuentaData.id);
      setNegocios(negociosData || []);
    }

    const { data: configData } = await supabase
      .from('configuracion_precio')
      .select('precio_base')
      .eq('id', 1)
      .maybeSingle();
    if (configData?.precio_base) setPrecioBase(configData.precio_base);

    setLoading(false);
  }

  // Espera la confirmación del pago: si volvés de MercadoPago (MercadoPago
  // agrega ?preapproval_id=... a la dirección de vuelta) o si quedó la
  // marca de que te fuiste a pagar, consultamos la cuenta cada 5 segundos
  // durante hasta 2 minutos, sea cual sea el plan con el que arrancaste
  // (prueba gratis, inactiva, pago trabado, etc.).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const volvioDeMercadoPago = params.has('preapproval_id');
    if (volvioDeMercadoPago) {
      // Limpiamos la dirección para que un refresh no vuelva a esperar.
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (!volvioDeMercadoPago && !leerMarcaPago()) return;

    setEsperaPago('esperando');
    const inicio = Date.now();
    let cancelado = false;
    let timeoutId = null;

    async function revisar() {
      const cuentaData = await leerCuenta(session.user.id);
      if (cancelado) return;
      if (cuentaData) setCuenta(cuentaData);

      if (estaAlDia(cuentaData)) {
        borrarMarcaPago();
        setEsperaPago('listo');
        return;
      }
      if (Date.now() - inicio >= TOPE_ESPERA_MS) {
        borrarMarcaPago();
        setEsperaPago('demorado');
        return;
      }
      timeoutId = setTimeout(revisar, INTERVALO_ESPERA_MS);
    }

    revisar();
    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentoEspera]);

  async function handleSuscribirme() {
    setIniciandoPago(true);
    setErrorPago(null);
    const { data, error } = await supabase.functions.invoke('crear-suscripcion', {
      method: 'POST',
      body: { cuenta_id: cuenta.id },
    });

    if (error || !data?.init_point) {
      // Si la función respondió con un mensaje propio (por ejemplo "ya
      // tenés un pago acreditándose"), mostramos ese.
      let mensaje = null;
      try {
        const cuerpo = await error?.context?.json();
        mensaje = cuerpo?.error || null;
      } catch {
        // sin cuerpo legible
      }
      setIniciandoPago(false);
      setErrorPago(mensaje || 'No se pudo iniciar el pago. Probá de nuevo en un momento.');
      return;
    }
    guardarMarcaPago();
    window.location.href = data.init_point;
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

  const estado = ESTADOS[cuenta.plan] || ESTADOS.inactive;
  const cantidadSucursales = Math.max(negocios.length, cuenta.sucursales_contratadas || 1);
  const precioMensual = precioTotalMensual(cantidadSucursales, precioBase);
  const textoPrecio = `$${precioMensual.toLocaleString('es-AR')}`;
  const textoPlan = `Con ${cantidadSucursales} sucursal${cantidadSucursales === 1 ? '' : 'es'}, tu plan sale ${textoPrecio} por mes.`;
  const topeEmpleadosTrial = (cuenta.sucursales_contratadas || 1) * EMPLEADOS_POR_SUCURSAL;

  const alDia = estaAlDia(cuenta);
  const cancelacionPendiente = cuenta.plan === 'active' && !!cuenta.cancelacion_pendiente;
  // Con el cobro trabado, "Pagar con otra tarjeta" arma una suscripción
  // nueva y crear-suscripcion da de baja la anterior sola.
  const pagoTrabado = cuenta.plan === 'past_due' || cuenta.plan === 'suspended';
  // Nunca ofrecemos suscribirse a una cuenta activa (al día o con la
  // cancelación ya pedida, que sigue teniendo acceso), ni mientras
  // esperamos la confirmación de un pago recién hecho.
  const mostrarBotonPago = cuenta.plan !== 'active' && esperaPago !== 'esperando';

  let descripcion = null;
  if (cuenta.plan === 'past_due') {
    const limite = formatearFecha(cuenta.past_due_limite);
    descripcion = limite
      ? `No pudimos cobrar la última cuota. Mercado Pago lo va a volver a intentar. Mientras tanto seguís usando Inductoria hasta el ${limite}. Si preferís, podés pagar con otra tarjeta.`
      : 'No pudimos cobrar la última cuota. Mercado Pago lo va a volver a intentar. Mientras tanto seguís usando Inductoria. Si preferís, podés pagar con otra tarjeta.';
  } else if (cuenta.plan === 'suspended') {
    descripcion = 'Tu cuenta quedó suspendida porque no pudimos cobrar la suscripción. Pagá con otra tarjeta para volver a usarla.';
  } else if (cuenta.plan === 'cancelled') {
    descripcion = `Tu suscripción está cancelada. Podés volver a suscribirte cuando quieras. ${textoPlan}`;
  } else if (trialActivo(cuenta)) {
    descripcion = `Te quedan ${textoTrialRestante(cuenta)} de prueba gratis. Durante la prueba podés cargar 1 sucursal y hasta ${topeEmpleadosTrial} empleados. Crear o actualizar cursos y procedimientos con IA, leer imágenes y el chat de dudas de tus empleados se habilitan cuando te suscribís. ${textoPlan}`;
  } else if (cuenta.plan === 'trial') {
    descripcion = `Tu prueba gratis venció. Suscribite para seguir usando Inductoria. ${textoPlan}`;
  } else if (cuenta.plan !== 'active') {
    // inactive o cualquier estado desconocido.
    descripcion = textoPlan;
  }

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <PageShell>
        <div className="bg-[#EDE0C8] rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#2C2C2A] flex items-center justify-center flex-shrink-0">
              <IconCard className="text-white" />
            </div>
            <span className="text-[15px] font-semibold text-[#2C2C2A]">Suscripción</span>
          </div>
          <span
            className="text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap"
            style={{ backgroundColor: estado.pillBg, color: estado.pillText }}
          >
            {estado.corto}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <div
            className="font-semibold text-sm rounded-full px-4 py-2 inline-block mb-4"
            style={{ backgroundColor: estado.pillBg, color: estado.pillText }}
          >
            {estado.largo}
          </div>

          {esperaPago === 'esperando' && (
            <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-lg p-3 text-sm text-[#2C2C2A] mb-4">
              Si ya pagaste en Mercado Pago, estamos esperando que nos confirmen el pago. Puede
              tardar un par de minutos y no hace falta que hagas nada: esta pantalla se actualiza
              sola.
            </div>
          )}
          {esperaPago === 'listo' && (
            <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-lg p-3 text-sm text-[#2C2C2A] mb-4">
              Listo, recibimos tu pago. Tu suscripción quedó activa.
            </div>
          )}
          {esperaPago === 'demorado' && !alDia && (
            <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455] mb-4">
              Todavía no nos llegó la confirmación de Mercado Pago. Si ya pagaste, a veces demora
              un rato más: volvé a entrar en unos minutos. Si el pago no se completó, podés
              intentarlo de nuevo.
            </div>
          )}

          {descripcion && <p className="text-sm text-[#6b6455] mb-4">{descripcion}</p>}

          {mostrarBotonPago && (
            <>
              <button
                onClick={handleSuscribirme}
                disabled={iniciandoPago}
                className="px-5 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E] disabled:opacity-60"
                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
              >
                {iniciandoPago
                  ? 'Redirigiendo...'
                  : pagoTrabado
                    ? 'Pagar con otra tarjeta'
                    : `Suscribirme por ${textoPrecio}/mes`}
              </button>
              {pagoTrabado && (
                <p className="text-xs text-[#6b6455] mt-2">
                  Tu suscripción anterior se da de baja sola, así que no te vamos a cobrar dos veces.
                </p>
              )}
              {errorPago && (
                <p className="text-xs font-semibold text-[#C1502E] mt-2">{errorPago}</p>
              )}
            </>
          )}

          {cancelacionPendiente && (
            <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455]">
              Cancelaste tu suscripción, no se va a renovar.{' '}
              {cuenta.acceso_hasta ? (
                <>
                  Seguís usando Inductoria como siempre hasta el{' '}
                  <strong className="text-[#2C2C2A]">{formatearFecha(cuenta.acceso_hasta)}</strong>.
                </>
              ) : (
                'Seguís usando Inductoria como siempre hasta el final del período que ya pagaste.'
              )}{' '}
              Después de esa fecha podés volver a suscribirte cuando quieras. Tus cursos, empleados y
              su progreso quedan guardados.
            </div>
          )}

          {alDia && (
            <div>
              <button
                onClick={() => setMostrarCancelar(true)}
                className="text-xs text-[#6b6455] underline"
              >
                Cancelar suscripción
              </button>
            </div>
          )}
        </div>
      </PageShell>

      {/* Gris oscuro #2C2C2A, el mismo del ícono circular de "Suscripción"
          de arriba: es el tono neutro que la app usa para lo que no es un
          llamado a la acción de pago (2026-09-06, a pedido de Roberto). */}
      <div className="pb-6 pt-2 flex justify-center px-4">
        <a
          href="/ayuda"
          className="inline-flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide text-white bg-[#2C2C2A] rounded-xl px-4 py-2.5"
          style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
        >
          <IconAyuda />
          ¿Cómo se usa Inductoria?
        </a>
      </div>

      {mostrarCancelar && (
        <CancelarSuscripcionModal
          onClose={() => setMostrarCancelar(false)}
          onCancelled={() => {
            setMostrarCancelar(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}
