import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import PageShell from '../components/PageShell';
import CancelarSuscripcionModal from '../components/CancelarSuscripcionModal';
import { precioTotalMensual } from '../lib/precio';
import { trialActivo, textoTrialRestante } from '../lib/acceso';

function IconCard(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

// Mismos 4 estados y mismos colores que ya usás en Repunte. "inactive" es
// propio de Inductoria (acá no hay trial), tratado con el mismo criterio
// que "prueba vencida" en Repunte: fondo suave, no una pastilla sólida
// como los otros 4, para que se lea distinto (todavía no es un problema
// de pago, es que nunca arrancó).
const ESTADOS = {
  inactive: {
    pillBg: '#FCE79A',
    pillText: '#C1502E',
    solido: false,
    corto: 'Inactiva',
    largo: 'Todavía no te suscribiste',
  },
  // Prueba gratis: mismo criterio visual que "inactive" (fondo suave,
  // no pastilla sólida como active/past_due/suspended/cancelled),
  // porque tampoco es un problema de pago.
  trial: {
    pillBg: '#DCEEF7',
    pillText: '#1B6E8C',
    solido: false,
    corto: 'Prueba gratis',
    largo: 'Estás en tu prueba gratis',
  },
  active: { pillBg: '#1D9E75', pillText: '#fff', solido: true, corto: 'Activa', largo: 'Suscripción activa' },
  past_due: {
    pillBg: '#EF9F27',
    pillText: '#fff',
    solido: true,
    corto: 'Pago pendiente',
    largo: 'Suscripción con pago pendiente',
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

export default function Suscripcion({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [precioBase, setPrecioBase] = useState(12000);
  const [loading, setLoading] = useState(true);
  const [iniciandoPago, setIniciandoPago] = useState(false);
  const [mostrarCancelar, setMostrarCancelar] = useState(false);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si volvés de MercadoPago con el botón "atrás" del navegador, a veces
  // Chrome restaura la página desde memoria (bfcache) en vez de recargarla,
  // y el botón se queda trabado diciendo "Redirigiendo..." para siempre.
  // Esto lo destraba y de paso refresca el estado real de la cuenta.
  useEffect(() => {
    function handlePageShow(event) {
      if (event.persisted) {
        setIniciandoPago(false);
        cargar();
      }
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar() {
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
        .select('id')
        .eq('cuenta_id', cuentaData.id);
      setNegocios(negociosData || []);
    }

    const { data: configData } = await supabase
      .from('configuracion_precio')
      .select('precio_base')
      .eq('id', 1)
      .maybeSingle();
    if (configData) setPrecioBase(configData.precio_base);

    setLoading(false);
  }

  // Cuando volvés de MercadoPago, el webhook que activa la cuenta puede
  // tardar unos segundos en llegar. Si nos fuimos a pagar (bandera con
  // reintentos restantes en sessionStorage, seteada en handleSuscribirme)
  // y la cuenta sigue en "inactive", forzamos un reload de la página a los
  // 3s en vez de dejarla así hasta que la persona refresque a mano. Tope de
  // 5 reintentos (~15s) para no quedar recargando en loop si el pago
  // realmente no se acredita.
  useEffect(() => {
    if (!cuenta) return;

    const intentosRestantes = parseInt(sessionStorage.getItem('inductoria_pago_pendiente') || '0', 10);
    if (intentosRestantes <= 0) return;

    if (cuenta.plan !== 'inactive') {
      sessionStorage.removeItem('inductoria_pago_pendiente');
      return;
    }

    sessionStorage.setItem('inductoria_pago_pendiente', String(intentosRestantes - 1));
    const timeoutId = setTimeout(() => {
      window.location.reload();
    }, 3000);

    return () => clearTimeout(timeoutId);
  }, [cuenta]);

  async function handleSuscribirme() {
    setIniciandoPago(true);
    const { data, error } = await supabase.functions.invoke('crear-suscripcion', {
      method: 'POST',
      body: { cuenta_id: cuenta.id },
    });
    setIniciandoPago(false);

    if (error || !data?.init_point) {
      alert('No se pudo iniciar el pago. Probá de nuevo en un momento.');
      return;
    }
    sessionStorage.setItem('inductoria_pago_pendiente', '5');
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
          <a href="/sucursales" className="inline-block px-5 py-2 rounded-lg font-semibold text-white bg-[#C1502E]">
            Ir a Sucursales
          </a>
        </div>
      </div>
    );
  }

  const estado = ESTADOS[cuenta.plan] || ESTADOS.inactive;
  const cantidadSucursales = Math.max(negocios.length, cuenta.sucursales_contratadas || 1);
  const precioMensual = precioTotalMensual(cantidadSucursales, precioBase);

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
            {cuenta.plan === 'active' &&
              cuenta.updated_at &&
              ` desde el ${new Date(cuenta.updated_at).toLocaleDateString('es-AR')}`}
          </div>

          {cuenta.plan !== 'active' && (
            <>
              <p className="text-sm text-[#6b6455] mb-4">
                {cuenta.plan === 'past_due' &&
                  'Regularizá tu pago para volver a usar todas las funciones.'}
                {cuenta.plan === 'suspended' &&
                  'Tu acceso quedó limitado. Ponete al día para reactivar tu cuenta.'}
                {cuenta.plan === 'cancelled' &&
                  'Tu suscripción está cancelada. Podés volver a suscribirte cuando quieras.'}
                {cuenta.plan === 'inactive' &&
                  `Con ${cantidadSucursales} sucursal${cantidadSucursales === 1 ? '' : 'es'}, tu plan sale $${precioMensual.toLocaleString('es-AR')}/mes.`}
                {trialActivo(cuenta) &&
                  `Te quedan ${textoTrialRestante(cuenta)} de prueba gratis. Podés usar Inductoria sin límite de empleados ni sucursales, salvo generar o actualizar cursos con IA. Con ${cantidadSucursales} sucursal${cantidadSucursales === 1 ? '' : 'es'}, tu plan sale $${precioMensual.toLocaleString('es-AR')}/mes.`}
                {cuenta.plan === 'trial' &&
                  !trialActivo(cuenta) &&
                  'Tu prueba gratis venció. Suscribite para seguir usando Inductoria.'}
              </p>
              <button
                onClick={handleSuscribirme}
                disabled={iniciandoPago}
                className="px-5 py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:opacity-60"
              >
                {iniciandoPago ? 'Redirigiendo...' : `Suscribirme por $${precioMensual.toLocaleString('es-AR')}/mes`}
              </button>
            </>
          )}

          {cuenta.plan === 'active' && cuenta.cancelacion_pendiente && (
            <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455]">
              Cancelaste tu suscripción — no se va a renovar. Mantenés acceso completo hasta el{' '}
              <strong className="text-[#2C2C2A]">
                {cuenta.acceso_hasta ? new Date(cuenta.acceso_hasta).toLocaleDateString('es-AR') : '—'}
              </strong>
              . Si te arrepentís, podés volver a suscribirte en cualquier momento después de esa
              fecha.
            </div>
          )}

          {cuenta.plan === 'active' && !cuenta.cancelacion_pendiente && (
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
