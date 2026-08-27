import { useEffect, useState } from 'react';
import PinGate from '../components/PinGate';

// Mismo ícono que usa Checklists.jsx del lado del dueño, para que se
// reconozca como la misma funcionalidad.
function IconChecklistMini(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 3h6l1 2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3l1-2z" />
      <path d="m8 11 1.3 1.3L12 9.8" />
      <path d="m8 16 1.3 1.3L12 14.8" />
    </svg>
  );
}

// Una tarjeta por checklist: cada uno se completa y se envía por separado
// (un empleado puede tener más de uno asignado a su puesto el mismo día,
// por ejemplo "Apertura" y "Cierre de caja").
function TarjetaChecklist({ checklist, token, onEnviado }) {
  const [marcados, setMarcados] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const [enviado, setEnviado] = useState(false);

  const yaCompletadoHoy = checklist.completado_hoy || enviado;
  const completadoPor = enviado ? null : checklist.completado_por;
  const todosMarcados = checklist.items.length > 0 && checklist.items.every((i) => marcados[i.id]);

  async function handleEnviar() {
    if (enviando) return;
    setEnviando(true);
    setErrorEnvio(null);

    const base = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      const res = await fetch(`${base}/functions/v1/empleado-checklist`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, checklist_id: checklist.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorEnvio(data.error || 'No se pudo enviar el checklist.');
        return;
      }
      setEnviado(true);
      if (onEnviado) onEnviado();
    } catch {
      setErrorEnvio('No se pudo enviar el checklist. Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-[26px] h-[26px] rounded-full bg-[#C1502E] flex items-center justify-center flex-shrink-0">
          <IconChecklistMini width="14" height="14" className="text-white" />
        </div>
        <h2 className="font-bold text-[#2C2C2A] text-base">{checklist.titulo}</h2>
      </div>

      {yaCompletadoHoy ? (
        <div className="text-center py-2">
          <p className="text-base font-bold text-[#2C2C2A] mb-1">✓ Completado hoy</p>
          <p className="text-sm text-[#6b6455]">
            {completadoPor ? `Lo completó ${completadoPor}.` : 'Gracias por completarlo.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-5">
            {checklist.items.map((item) => (
              <label
                key={item.id}
                className="flex items-start gap-2.5 text-sm text-[#2C2C2A] font-medium bg-[#FBF7EA] border border-[#EDE0C8] rounded-lg px-3 py-2.5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!!marcados[item.id]}
                  onChange={(e) => setMarcados({ ...marcados, [item.id]: e.target.checked })}
                  className="mt-0.5 flex-shrink-0 accent-[#7C8B6F]"
                />
                {item.texto}
              </label>
            ))}
          </div>

          {errorEnvio && <p className="text-xs text-[#C1502E] mb-3">{errorEnvio}</p>}

          <button
            onClick={handleEnviar}
            disabled={!todosMarcados || enviando}
            className="w-full py-2 rounded-lg font-bold tracking-wide text-white bg-[#7C8B6F] disabled:bg-[#EFDDCE] disabled:text-[#8a8471] disabled:font-semibold disabled:tracking-normal"
            style={todosMarcados && !enviando ? { textShadow: '0 1px 1px rgba(0,0,0,0.35)' } : undefined}
          >
            {enviando ? 'Enviando...' : 'Enviar checklist'}
          </button>
        </>
      )}
    </div>
  );
}

function ChecklistInterno() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checklists, setChecklists] = useState([]);

  useEffect(() => {
    if (!token) {
      setError('Falta información en el link.');
      setLoading(false);
      return;
    }

    const base = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    fetch(`${base}/functions/v1/empleado-checklist?token=${encodeURIComponent(token)}`, {
      headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || 'No se pudo cargar el checklist.');
          return;
        }
        setChecklists(data.checklists || []);
      })
      .catch(() => setError('No se pudo cargar el checklist.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <p className="text-center mt-24 text-[#6b6455]">Cargando...</p>;
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-24 px-4 text-center">
        <p className="text-[#C1502E] font-semibold mb-4">{error}</p>
        <a
          href={`/empleado?token=${token}`}
          className="inline-block px-5 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]"
          style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
        >
          Volver a Mi perfil
        </a>
      </div>
    );
  }

  if (checklists.length === 0) {
    return (
      <div className="max-w-md mx-auto mt-24 px-4 text-center">
        <p className="text-[#6b6455] font-medium">No tenés ningún checklist activo por el momento.</p>
        <a
          href={`/empleado?token=${token}`}
          className="inline-block mt-4 px-5 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]"
          style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
        >
          Volver a Mi perfil
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-md sm:max-w-xl mx-auto mt-8 px-4 sm:px-0 pb-16">
      <h1 className="font-bold text-[#2C2C2A] text-lg mb-5">Checklist de hoy</h1>

      <div className="space-y-4">
        {checklists.map((c) => (
          <TarjetaChecklist key={c.id} checklist={c} token={token} onEnviado={() => {}} />
        ))}
      </div>

      <a
        href={`/empleado?token=${token}`}
        className="block w-full py-2 rounded-lg text-center font-bold tracking-wide text-white bg-[#C1502E] mt-5"
        style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
      >
        Volver a Mi perfil
      </a>
    </div>
  );
}

export default function Checklist() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  return (
    <PinGate token={token}>
      <ChecklistInterno />
    </PinGate>
  );
}
