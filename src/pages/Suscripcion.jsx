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

export default function Suscripcion({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar() {
    setLoading(true);
    const { data } = await supabase
      .from('cuentas')
      .select('*')
      .eq('owner_id', session.user.id)
      .maybeSingle();
    setCuenta(data);
    setLoading(false);
  }

  if (loading) {
    return <p className="text-center mt-24 text-[#6b6455]">Cargando...</p>;
  }

  if (!cuenta) {
    return (
      <div>
        <DashboardNav userEmail={session.user.email} />
        <p className="text-center mt-12 text-[#6b6455]">
          Primero cargá el nombre de tu negocio en la pantalla de Sucursales.
        </p>
      </div>
    );
  }

  const activa = cuenta.plan === 'active';

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <div className="max-w-4xl mx-auto mt-6 px-4 pb-16">
        <div className="bg-[#F5EFE3] rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#2C2C2A] flex items-center justify-center flex-shrink-0">
              <IconCard className="text-white" />
            </div>
            <span className="text-[15px] font-semibold text-[#2C2C2A]">Suscripción</span>
          </div>
          <span
            className="text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap"
            style={{
              backgroundColor: activa ? '#eef9f4' : '#fbe9e9',
              color: activa ? '#1D9E75' : '#C1502E',
            }}
          >
            {activa ? 'Activa' : 'Inactiva'}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          {activa ? (
            <div className="bg-[#eef9f4] text-[#1D9E75] font-semibold text-sm rounded-full px-4 py-2 inline-block mb-2">
              Suscripción activa
              {cuenta.updated_at && ` desde el ${new Date(cuenta.updated_at).toLocaleDateString('es-AR')}`}
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-[#2C2C2A] mb-2">Tu cuenta todavía no está activa.</p>
              <p className="text-sm text-[#6b6455]">
                Escribinos para activar tu suscripción. La activación por pago automático todavía no está
                disponible, la estamos por sumar.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
