import { useState } from 'react';
import { supabase } from '../supabaseClient';

// Modal de confirmacion fuerte para dar de baja la suscripcion.
// Solo debe montarse/mostrarse cuando business.plan === 'active'
// (el llamador decide eso, este componente no lo revisa).
export default function CancelarSuscripcionModal({ onClose, onCancelled }) {
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const confirmado = texto.trim().toUpperCase() === 'CANCELAR';

  async function handleCancelar() {
    if (!confirmado || loading) return;
    setLoading(true);
    setError('');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancelar-suscripcion`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo cancelar. Intentá de nuevo.');
        setLoading(false);
        return;
      }
      setLoading(false);
      onCancelled?.();
    } catch (err) {
      console.error(err);
      setError('Error de conexión. Intentá de nuevo.');
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-sm w-full border border-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-[#1b2e35] mb-2">
          ¿Cancelar tu suscripción?
        </h3>
        <p className="text-sm text-[#6b7a80] mb-1">
          Vas a perder acceso a Inductoria al final de tu período ya pagado.
          Tus cursos, empleados y su progreso quedan guardados por si volvés,
          pero no vas a poder usarlos hasta reactivar.
        </p>
        <p className="text-sm text-[#6b7a80] mb-4">
          Esta acción no se puede deshacer desde acá. Si estás seguro,
          escribí <b>CANCELAR</b> abajo.
        </p>

        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribí CANCELAR"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none mb-2"
          autoFocus
        />

        {error && (
          <p className="text-xs text-[#E24B4A] mb-2">{error}</p>
        )}

        <div className="flex gap-2 mt-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2 rounded-lg font-semibold text-[#1b2e35] bg-[#eef0ec] disabled:opacity-60"
          >
            Volver
          </button>
          <button
            onClick={handleCancelar}
            disabled={!confirmado || loading}
            className="flex-1 py-2 rounded-lg font-semibold text-white bg-[#E24B4A] disabled:opacity-40"
          >
            {loading ? 'Cancelando...' : 'Cancelar suscripción'}
          </button>
        </div>
      </div>
    </div>
  );
}
