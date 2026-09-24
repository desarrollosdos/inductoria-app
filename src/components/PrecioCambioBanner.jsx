import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { precioTotalMensual } from '../lib/precio';

// Aviso de cambio de precio programado desde Admin (tabla precio_cambios,
// mismo mecanismo que Repunte). Se ve desde que se programa el cambio
// hasta el día en que rige; ese día aplicar-cambio-precio lo marca como
// aplicado y el aviso desaparece solo.
export default function PrecioCambioBanner({ cuenta }) {
  const [cambio, setCambio] = useState(null);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from('precio_cambios')
      .select('precio_base_nuevo, precio_base_anterior, vigente_desde')
      .is('aplicado_at', null)
      .is('cancelado_at', null)
      .order('vigente_desde', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelado) setCambio(data || null);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  if (!cuenta || !cambio) return null;

  const fecha = new Date(`${cambio.vigente_desde}T12:00:00`).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const sucursales = Math.max(1, cuenta.sucursales_contratadas || 1);
  const montoNuevo = precioTotalMensual(sucursales, Number(cambio.precio_base_nuevo));
  const pagaHoy = cuenta.plan === 'active' || cuenta.plan === 'past_due';

  let texto;
  if (pagaHoy && cambio.precio_base_anterior) {
    const montoActual = precioTotalMensual(sucursales, Number(cambio.precio_base_anterior));
    texto = (
      <>
        Desde el <strong className="text-[#2C2C2A]">{fecha}</strong> tu plan pasa de{' '}
        <strong className="text-[#2C2C2A]">${montoActual.toLocaleString('es-AR')}</strong> a{' '}
        <strong className="text-[#2C2C2A]">${montoNuevo.toLocaleString('es-AR')}</strong> por mes. Se
        actualiza solo en Mercado Pago. Si no estás de acuerdo, podés cancelar cuando quieras desde
        Suscripción, sin ningún cargo.
      </>
    );
  } else {
    texto = (
      <>
        Desde el <strong className="text-[#2C2C2A]">{fecha}</strong> el precio de Inductoria pasa a{' '}
        <strong className="text-[#2C2C2A]">${montoNuevo.toLocaleString('es-AR')}</strong> por mes
        {sucursales === 1 ? '' : ` para ${sucursales} sucursales`}.
      </>
    );
  }

  return (
    <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-xl px-4 py-3 text-sm text-[#6b6455]">
      {texto}
    </div>
  );
}
