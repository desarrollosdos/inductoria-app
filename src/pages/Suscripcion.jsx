import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';

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

function precioPorSucursales(n) {
  if (n <= 1) return 12000;
  if (n <= 4) return n * 10000;
  if (n <= 9) return n * 9000;
  return n * 8000;
}

export default function Suscripcion({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [iniciandoPago, setIniciandoPago] = useState(false);

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

    setLoading(false);
  }

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
  const precioMensual = precioPorSucursales(cantidadSucursales);

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <div className="max-w-4xl mx-auto mt-6 px-4 pb-16">
        <div className="bg-[#EDE0C8] rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
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
        </div>
      </div>
    </div>
  );
}
