// inductoria-app · src/components/PinGate.jsx
// -------------------------------------------------
// Envuelve el contenido de una pantalla pública basada en token
// (Empleado.jsx, CursoDetalle.jsx, Checklist.jsx) y no lo muestra hasta
// que se ingresa el PIN de 4 dígitos correcto.
//
// 2026-09-24: antes se guardaba solo una marca de "PIN ok" y el servidor
// aceptaba el token solo, así que el PIN se podía saltear llamando a las
// funciones directo. Ahora el servidor pide el PIN en cada pedido (header
// x-empleado-pin), así que acá se guarda el PIN en sí (en este
// dispositivo) y se lo pasa a las pantallas con usePinEmpleado(). Si el
// servidor dice que el PIN no va (cambió, o está bloqueado por muchos
// intentos), se borra y se vuelve a pedir con el mensaje del servidor.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const HEADER_PIN = 'x-empleado-pin';

// Códigos que manda _shared/empleado-auth.ts cuando hay que volver a
// pedir el PIN. Se mira el código y no solo el status: preguntar-curso
// también responde 403 cuando la cuenta no tiene el chat de IA, y eso no
// tiene nada que ver con el PIN.
const CODIGOS_PIN = new Set(['pin_requerido', 'pin_incorrecto', 'pin_bloqueado']);

const PinContext = createContext(null);

// Respaldo en memoria para cuando localStorage no anda (modo privado,
// almacenamiento bloqueado): el PIN dura mientras la pestaña esté abierta.
const pinsEnMemoria = new Map();

function clavePin(token) {
  return `inductoria_pin_${token}`;
}
function claveMarcaVieja(token) {
  return `inductoria_pin_ok_${token}`;
}

function leerPinGuardado(token) {
  try {
    const guardado = localStorage.getItem(clavePin(token));
    if (guardado && /^\d{4}$/.test(guardado)) return guardado;
  } catch {
    // sin localStorage: se usa lo que haya en memoria
  }
  return pinsEnMemoria.get(token) || null;
}

function guardarPin(token, pin) {
  pinsEnMemoria.set(token, pin);
  try {
    localStorage.setItem(clavePin(token), pin);
    localStorage.removeItem(claveMarcaVieja(token));
  } catch {
    // queda en memoria
  }
}

function borrarPin(token) {
  pinsEnMemoria.delete(token);
  try {
    localStorage.removeItem(clavePin(token));
    localStorage.removeItem(claveMarcaVieja(token));
  } catch {
    // no-op
  }
}

// La marca vieja ("PIN ok" sin el PIN) de antes de este cambio: si está,
// se le pide el PIN una vez más y se borra.
function teniaMarcaVieja(token) {
  try {
    return !!localStorage.getItem(claveMarcaVieja(token));
  } catch {
    return false;
  }
}

async function leerJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// Hook para las pantallas del empleado. Devuelve { pin, token,
// fetchEmpleado }. fetchEmpleado(funcion, { method, query, body }) llama
// a la Edge Function con el token y el PIN ya puestos y devuelve
// { ok, status, data }. Si el problema es el PIN, PinGate se encarga de
// volver a pedirlo (y la pantalla se vuelve a montar al confirmarlo).
// Si falla la red, tira la excepción como un fetch común.
export function usePinEmpleado() {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error('usePinEmpleado tiene que usarse dentro de <PinGate>');
  return ctx;
}

export default function PinGate({ token, children }) {
  const [pinVerificado, setPinVerificado] = useState(null);
  const [revisandoCache, setRevisandoCache] = useState(true);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    if (!token) {
      setRevisandoCache(false);
      return;
    }
    const guardado = leerPinGuardado(token);
    if (guardado) {
      setPinVerificado(guardado);
    } else if (teniaMarcaVieja(token)) {
      borrarPin(token);
      setAviso('Por seguridad, volvé a ingresar tu PIN. Es solo esta vez.');
    }
    setRevisandoCache(false);
  }, [token]);

  const pedirPinDeNuevo = useCallback(
    (mensaje) => {
      borrarPin(token);
      setPin('');
      setAviso(null);
      setError(mensaje || 'Volvé a ingresar tu PIN.');
      setPinVerificado(null);
    },
    [token]
  );

  const fetchEmpleado = useCallback(
    async (funcion, { method = 'GET', query = {}, body } = {}) => {
      const base = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const params = new URLSearchParams();
      if (method === 'GET') params.set('token', token);
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null) params.set(k, v);
      });
      const qs = params.toString();

      const headers = {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        [HEADER_PIN]: pinVerificado || '',
      };
      const opciones = { method, headers };
      if (method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        opciones.body = JSON.stringify({ ...(body || {}), token });
      }

      const res = await fetch(`${base}/functions/v1/${funcion}${qs ? `?${qs}` : ''}`, opciones);
      const data = await leerJson(res);

      if (!res.ok && CODIGOS_PIN.has(data?.codigo)) {
        pedirPinDeNuevo(data.error);
        return { ok: false, status: res.status, data, pinInvalido: true };
      }
      return { ok: res.ok, status: res.status, data };
    },
    [token, pinVerificado, pedirPinDeNuevo]
  );

  const valorContexto = useMemo(
    () => ({ pin: pinVerificado, token, fetchEmpleado }),
    [pinVerificado, token, fetchEmpleado]
  );

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
          [HEADER_PIN]: pin,
        },
        body: JSON.stringify({ token }),
      });
      const data = await leerJson(res);

      if (!res.ok) {
        setError(data.error || 'El PIN no es correcto.');
        setPin('');
        return;
      }

      guardarPin(token, pin);
      setAviso(null);
      setPinVerificado(pin);
    } catch {
      setError('No se pudo verificar. Revisá tu conexión y probá de nuevo.');
    } finally {
      setVerificando(false);
    }
  }

  if (revisandoCache) return null;

  if (!token) {
    return (
      <p className="text-center mt-24 text-[#6b6455] px-4">
        Este link no funciona. Pedile uno nuevo a tu encargado.
      </p>
    );
  }

  if (!pinVerificado) {
    return (
      <div className="max-w-sm mx-auto mt-20 px-4">
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6 text-center">
          <h1 className="text-lg font-bold text-[#2C2C2A] mb-1">Confirmá que sos vos</h1>
          <p className="text-sm text-[#6b6455] mb-5">
            Ingresá el PIN de 4 dígitos que te dio tu empleador.
          </p>
          {aviso && !error && <p className="text-xs text-[#6b6455] mb-3">{aviso}</p>}
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
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

  return <PinContext.Provider value={valorContexto}>{children}</PinContext.Provider>;
}
