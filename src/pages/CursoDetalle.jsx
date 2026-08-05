import { useEffect, useState } from 'react';

function esCursoSeguridadEHigiene(titulo) {
  const t = (titulo || '').toLowerCase();
  return t.includes('seguridad') && t.includes('higiene');
}

// Badge estándar: círculo terracota, para cualquier curso.
function BadgeCurso({ size = 72 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <circle cx="50" cy="50" r="44" fill="#FBEAE3" stroke="#C1502E" strokeWidth="4" />
      <path
        d="M32 51 L44 63 L70 35"
        fill="none"
        stroke="#C1502E"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Badge especial: escudo dorado con cinta, exclusivo para Seguridad e Higiene.
function BadgeEspecial({ size = 88 }) {
  return (
    <svg viewBox="0 0 100 110" width={size} height={size}>
      <path
        d="M50 4 L88 18 V50 C88 76 71 94 50 106 C29 94 12 76 12 50 V18 Z"
        fill="#F6D06B"
        stroke="#C1502E"
        strokeWidth="4"
      />
      <path
        d="M35 52 L46 63 L67 38"
        fill="none"
        stroke="#C1502E"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CursoDetalle() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const microcursoId = params.get('curso');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [curso, setCurso] = useState(null);

  const [pasoActual, setPasoActual] = useState(0);
  const [enEvaluacion, setEnEvaluacion] = useState(false);
  const [respuestas, setRespuestas] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const [chatAbierto, setChatAbierto] = useState(false);
  const [pregunta, setPregunta] = useState('');
  const [historialChat, setHistorialChat] = useState([]);
  const [enviandoPregunta, setEnviandoPregunta] = useState(false);
  const [errorChat, setErrorChat] = useState(null);
  const [preguntasRestantes, setPreguntasRestantes] = useState(null);

  useEffect(() => {
    if (!token || !microcursoId) {
      setError('Falta información en el link.');
      setLoading(false);
      return;
    }

    const base = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    fetch(
      `${base}/functions/v1/empleado-curso?token=${encodeURIComponent(token)}&microcurso_id=${encodeURIComponent(
        microcursoId
      )}`,
      { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey } }
    )
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || 'No se pudo cargar el curso.');
          return;
        }
        setCurso(data);
        setRespuestas(new Array(data.preguntas.length).fill(null));
      })
      .catch(() => setError('No se pudo cargar el curso.'))
      .finally(() => setLoading(false));
  }, [token, microcursoId]);

  async function handleEnviarEvaluacion() {
    setEnviando(true);
    const base = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const res = await fetch(`${base}/functions/v1/empleado-completar-curso`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, microcurso_id: microcursoId, respuestas }),
    });
    const data = await res.json();
    setEnviando(false);

    if (!res.ok) {
      setError(data.error || 'No se pudo guardar tu resultado.');
      return;
    }
    setResultado(data);
  }

  async function handleEnviarPregunta(e) {
    e.preventDefault();
    if (!pregunta.trim() || enviandoPregunta) return;

    const preguntaActual = pregunta.trim();
    setEnviandoPregunta(true);
    setErrorChat(null);

    const base = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      const res = await fetch(`${base}/functions/v1/preguntar-curso`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, microcurso_id: microcursoId, pregunta: preguntaActual }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorChat(data.error || 'No se pudo enviar la pregunta.');
        return;
      }

      setHistorialChat((h) => [...h, { pregunta: preguntaActual, respuesta: data.respuesta }]);
      setPreguntasRestantes(data.preguntas_restantes);
      setPregunta('');
    } catch {
      setErrorChat('No se pudo enviar la pregunta. Probá de nuevo.');
    } finally {
      setEnviandoPregunta(false);
    }
  }

  if (loading) {
    return <p className="text-center mt-24 text-[#6b6455]">Cargando...</p>;
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-24 px-4 text-center">
        <p className="text-[#C1502E] font-semibold">{error}</p>
        <a href={`/empleado?token=${token}`} className="text-sm text-[#6b6455] underline mt-2 inline-block">
          Volver a Mi perfil
        </a>
      </div>
    );
  }

  if (resultado) {
    const esEspecial = esCursoSeguridadEHigiene(curso.titulo);
    return (
      <div className="max-w-md mx-auto mt-16 px-4 text-center">
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-8">
          <div className="flex justify-center mb-3">
            {esEspecial ? <BadgeEspecial /> : <BadgeCurso />}
          </div>
          {esEspecial && (
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#C1502E] mb-3">
              Badge especial · Seguridad e Higiene
            </p>
          )}
          <div className="w-16 h-16 rounded-full bg-[#eef9f4] text-[#1D9E75] flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            {resultado.puntaje}%
          </div>
          <h1 className="text-lg font-bold text-[#2C2C2A] mb-1">¡Listo!</h1>
          <p className="text-sm text-[#6b6455] mb-6">
            Respondiste bien {resultado.correctas} de {resultado.total} preguntas.
          </p>
          <a
            href={`/empleado?token=${token}`}
            className="inline-block px-5 py-2 rounded-lg font-semibold text-white bg-[#C1502E]"
          >
            Volver a Mi perfil
          </a>
        </div>
      </div>
    );
  }

  const { titulo, pasos, preguntas } = curso;

  // Evaluación
  if (enEvaluacion) {
    const todasRespondidas = respuestas.every((r) => r !== null);
    return (
      <div className="max-w-md mx-auto mt-8 px-4 pb-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-1">Evaluación</p>
        <h1 className="mb-6 text-[clamp(0.8rem,4vw,1rem)] whitespace-nowrap overflow-hidden">
          {titulo.includes(':') ? (
            <>
              <span className="font-bold text-[#C1502E]">{titulo.split(':')[0]}:</span>
              <span className="text-[#2C2C2A]">{titulo.split(':').slice(1).join(':')}</span>
            </>
          ) : (
            <span className="font-bold text-[#C1502E]">{titulo}</span>
          )}
        </h1>

        <div className="space-y-5">
          {preguntas.map((p, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#EFDDCE] p-4">
              <p className="text-sm font-semibold text-[#2C2C2A] mb-3">
                {i + 1}. {p.pregunta}
              </p>
              <div className="space-y-2">
                {p.opciones.map((op, j) => (
                  <label
                    key={j}
                    className="flex items-center gap-2 text-sm text-[#3d382c] border border-[#EDE0C8] rounded-lg px-3 py-2 cursor-pointer has-[:checked]:border-[#C1502E] has-[:checked]:bg-[#FBEAE3]"
                  >
                    <input
                      type="radio"
                      name={`pregunta-${i}`}
                      checked={respuestas[i] === j}
                      onChange={() => {
                        const nuevas = [...respuestas];
                        nuevas[i] = j;
                        setRespuestas(nuevas);
                      }}
                    />
                    {op}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleEnviarEvaluacion}
          disabled={!todasRespondidas || enviando}
          className="w-full mt-6 py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:bg-[#EDE0C8] disabled:text-[#8a8471]"
        >
          {enviando ? 'Enviando...' : 'Terminar curso'}
        </button>
      </div>
    );
  }

  // Pasos, uno por vez
  const paso = pasos[pasoActual];
  const esUltimoPaso = pasoActual === pasos.length - 1;

  return (
    <div className="max-w-md mx-auto mt-8 px-4 pb-16">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-1">
        Paso {pasoActual + 1} de {pasos.length}
      </p>
      <h1 className="mb-4 text-[clamp(0.8rem,4vw,1rem)] whitespace-nowrap overflow-hidden">
        {titulo.includes(':') ? (
          <>
            <span className="font-bold text-[#C1502E]">{titulo.split(':')[0]}:</span>
            <span className="text-[#2C2C2A]">{titulo.split(':').slice(1).join(':')}</span>
          </>
        ) : (
          <span className="font-bold text-[#C1502E]">{titulo}</span>
        )}
      </h1>

      <div className="w-full h-1.5 bg-[#EDE0C8] rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-[#C1502E] rounded-full"
          style={{ width: `${((pasoActual + 1) / pasos.length) * 100}%` }}
        />
      </div>

      <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
        <h2 className="font-bold text-[#2C2C2A] mb-3">{paso.titulo}</h2>
        <p className="text-sm text-[#3d382c] leading-relaxed">{paso.contenido}</p>
      </div>

      <div className="flex gap-2 mt-4">
        {pasoActual > 0 && (
          <button
            onClick={() => setPasoActual(pasoActual - 1)}
            className="px-4 py-2 rounded-lg font-semibold text-[#8a8471] border border-[#EFDDCE]"
          >
            Anterior
          </button>
        )}
        <button
          onClick={() => (esUltimoPaso ? setEnEvaluacion(true) : setPasoActual(pasoActual + 1))}
          className="flex-1 py-2 rounded-lg font-semibold text-white bg-[#C1502E]"
        >
          {esUltimoPaso ? 'Ir a la evaluación' : 'Siguiente'}
        </button>
      </div>

      <div className="mt-4">
        {!chatAbierto ? (
          <button
            onClick={() => setChatAbierto(true)}
            className="w-full py-2 rounded-lg font-semibold text-[#C1502E] border border-[#C1502E] bg-[#FBEAE3]"
          >
            ¿Tenés una duda puntual?
          </button>
        ) : (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-[#2C2C2A]">Preguntá sobre este curso</p>
              <button onClick={() => setChatAbierto(false)} className="text-xs text-[#8a8471]">
                Cerrar
              </button>
            </div>

            {historialChat.length > 0 && (
              <div className="space-y-3 mb-3 max-h-64 overflow-y-auto">
                {historialChat.map((h, i) => (
                  <div key={i}>
                    <p className="text-xs font-semibold text-[#2C2C2A] mb-1">Vos: {h.pregunta}</p>
                    <p className="text-sm text-[#3d382c] bg-[#FBF7EA] rounded-lg p-2">{h.respuesta}</p>
                  </div>
                ))}
              </div>
            )}

            {errorChat && <p className="text-xs text-[#C1502E] mb-2">{errorChat}</p>}

            <form onSubmit={handleEnviarPregunta} className="flex gap-2">
              <input
                type="text"
                value={pregunta}
                onChange={(e) => setPregunta(e.target.value)}
                placeholder="Escribí tu duda..."
                disabled={enviandoPregunta}
                className="flex-1 border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={enviandoPregunta || !pregunta.trim()}
                className="px-4 py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:bg-[#EFDDCE] disabled:text-[#8a8471]"
              >
                {enviandoPregunta ? '...' : 'Enviar'}
              </button>
            </form>

            {preguntasRestantes !== null && (
              <p className="text-[10px] text-[#8a8471] mt-2">
                {preguntasRestantes > 0
                  ? `Te quedan ${preguntasRestantes} preguntas hoy.`
                  : 'Llegaste al límite de preguntas de hoy.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
