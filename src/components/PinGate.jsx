// inductoria-app · src/components/PinGate.jsx
// -------------------------------------------------
// Envuelve el contenido de una pantalla pública basada en token
// (Empleado.jsx, CursoDetalle.jsx) y no lo muestra hasta que se
// ingresa el PIN de 4 dígitos correcto. Una vez verificado en ese
// dispositivo, queda guardado en localStorage y no se vuelve a pedir.

import { useEffect, useState } from 'react';

export default function PinGate({ token, children }) {
  const [verificado, setVerificado] = useState(false);
  const [revisandoCache, setRevisandoCache] = useState(true);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    if (token && localStorage.getItem(`inductoria_pin_ok_${token}`)) {
      setVerificado(true);
    }
    setRevisandoCache(false);
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (pin.length !== 4 || verificando) return;

    setVerificando(true);
    setError(null);

    const base = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      const res = await fetch(`${base}/functions/v1/verificar-empleado`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, pin }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'PIN incorrecto.');
        return;
      }

      localStorage.setItem(`inductoria_pin_ok_${token}`, '1');
      setVerificado(true);
    } catch {
      setError('No se pudo verificar. Probá de nuevo.');
    } finally {
      setVerificando(false);
    }
  }

  if (revisandoCache) return null;

  if (!verificado) {
    return (
      <div className="max-w-sm mx-auto mt-20 px-4">
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6 text-center">
          <h1 className="text-lg font-bold text-[#2C2C2A] mb-1">Confirmá que sos vos</h1>
          <p className="text-sm text-[#6b6455] mb-5">
            Ingresá el PIN de 4 dígitos que te dio tu empleador.
          </p>
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="• • • •"
              autoFocus
              className="w-full text-center text-2xl tracking-[0.6em] border border-[#EFDDCE] rounded-lg px-3 py-3 mb-3 outline-none focus:border-[#C1502E]"
            />
            {error && <p className="text-xs text-[#C1502E] mb-3">{error}</p>}
            <button
              type="submit"
              disabled={pin.length !== 4 || verificando}
              className="w-full py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:bg-[#EFDDCE] disabled:text-[#8a8471]"
            >
              {verificando ? 'Verificando...' : 'Confirmar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return children;
}
