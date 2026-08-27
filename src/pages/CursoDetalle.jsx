import { useEffect, useState } from 'react';
import { generarCertificadoPDF } from '../lib/certificado';
import { esCursoSeguridadEHigiene, BadgeCursoImg, BadgeEspecialImg } from '../components/Badges';
import PinGate from '../components/PinGate';

// Si el contenido del paso viene en varias líneas (cosas puntuales), se
// muestra como lista con viñetas, mucho más práctico de leer que un
// párrafo corrido. Si es un solo bloque de texto, se muestra como párrafo.
function ContenidoPaso({ texto }) {
  const lineas = (texto || '')
    .split('\n')
    .map((l) => l.replace(/^[\s•\-*]+/, '').trim())
    .filter(Boolean);

  if (lineas.length > 1) {
    return (
      <ul className="space-y-2 list-disc pl-5 marker:text-[#C1502E]">
        {lineas.map((l, i) => (
          <li key={i} className="text-[15px] text-[#2C2C2A] font-medium leading-relaxed">
            {l}
          </li>
        ))}
      </ul>
    );
  }

  return <p className="text-[15px] text-[#2C2C2A] font-medium leading-relaxed">{texto}</p>;
}

// Clave de localStorage para recordar que este empleado ya terminó este
// curso puntual. Antes, si terminaba el curso y por error (o a propósito)
// hacía refresh en la pantalla de resultado, "resultado" volvía a null y
// lo mandaba a rehacer el curso de cero — nada le avisaba que ya lo había
// completado. Guardando el resultado acá, un refresh restaura esa misma
// pantalla en vez de reiniciar el curso.
function claveResultado(token, microcursoId) {
  return `inductoria-resultado:${token}:${microcursoId}`;
}

// Título del curso: siempre se muestra completo. Se achica con el ancho
// disponible pero puede pasar a una segunda línea si hace falta, en vez
// de cortarse.
function TituloCurso({ titulo, className = '' }) {
  const partes = titulo.includes(':') ? [titulo.split(':')[0], titulo.split(':').slice(1).join(':')] : null;
  return (
    <h1 className={`text-[clamp(1.05rem,4.2vw,1.4rem)] leading-snug break-words ${className}`}>
      {partes ? (
        <>
          <span className="font-bold text-[#C1502E]">{partes[0]}:</span>
          <span className="text-[#2C2C2A]">{partes[1]}</span>
        </>
      ) : (
        <span className="font-bold text-[#C1502E]">{titulo}</span>
      )}
    </h1>
  );
}

function CursoDetalleInterno() {
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

  const [acuseChecked, setAcuseChecked] = useState(false);
  const [enviandoAcuse, setEnviandoAcuse] = useState(false);
  const [acuseFecha, setAcuseFecha] = useState(null);
  const [errorAcuse, setErrorAcuse] = useState(null);

  const [chatAbierto, setChatAbierto] = useState(false);
  const [pregunta, setPregunta] = useState('');
  const [historialChat, setHistorialChat] = useState([]);
  const [enviandoPregunta, setEnviandoPregunta] = useState(false);
  const [errorChat, setErrorChat] = useState(null);
  const [preguntasRestantes, setPreguntasRestantes] = useState(null);

  const [datosEmpleado, setDatosEmpleado] = useState(null);
  const [generandoCertificado, setGenerandoCertificado] = useState(false);

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

        // El servidor ahora es la fuente de verdad del progreso de este
        // empleado en este curso puntual (viene de progreso_empleado). Si
        // ya lo completó alguna vez —apruebe o no, y sin importar desde
        // qué dispositivo o navegador— reconstruimos acá la pantalla de
        // resultado. Esto es lo que permite volver a entrar en cualquier
        // momento, por ejemplo para terminar de confirmar un acuse de
        // recibido pendiente o volver a descargar el certificado, en vez
        // de depender de que el resultado siga guardado en el localStorage
        // de ese mismo navegador.
        if (data.progreso) {
          setResultado({
            puntaje: data.progreso.puntaje,
            correctas: data.progreso.correctas,
            total: data.progreso.total,
            aprobado: data.progreso.completado,
            fecha_completado: data.progreso.fecha_completado,
          });
          if (data.progreso.acuse_confirmado_at) {
            setAcuseFecha(data.progreso.acuse_confirmado_at);
          }
        } else {
          // Fallback de compatibilidad: un resultado guardado en
          // localStorage de antes de este cambio, o de un instante en que
          // el registro en el servidor todavía no se haya terminado de
          // escribir.
          try {
            const guardado = localStorage.getItem(claveResultado(token, microcursoId));
            if (guardado) setResultado(JSON.parse(guardado));
          } catch {
            // localStorage puede fallar (modo privado, cuota llena, etc.) —
            // en el peor caso el empleado ve el curso de nuevo, no es grave.
          }
        }
      })
      .catch(() => setError('No se pudo cargar el curso.'))
      .finally(() => setLoading(false));
  }, [token, microcursoId]);

  useEffect(() => {
    if (!resultado || !token) return;
    const base = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    fetch(`${base}/functions/v1/empleado-info?token=${encodeURIComponent(token)}`, {
      headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
    })
      .then((res) => res.json())
      .then((data) => setDatosEmpleado(data))
      .catch(() => {});
  }, [resultado, token]);

  function handleDescargarCertificado() {
    if (!resultado || !curso) return;
    setGenerandoCertificado(true);

    generarCertificadoPDF({
      nombreEmpleado: datosEmpleado?.empleado?.nombre || 'Empleado',
      negocioNombre: datosEmpleado?.negocio?.nombre || '',
      tituloCurso: curso.titulo,
      puntaje: resultado.puntaje,
      fechaCompletado: new Date().toISOString(),
    });

    setGenerandoCertificado(false);
  }

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
    // El endpoint no manda fecha_completado (no la necesita para calificar),
    // así que la completamos acá mismo con el mismo criterio que usa el
    // servidor: solo si aprobó, y con el momento real en que lo hizo. La
    // próxima vez que este empleado entre a esta pantalla, esa fecha ya va
    // a venir directamente del servidor (progreso_empleado.fecha_completado).
    const resultadoCompleto = { ...data, fecha_completado: data.aprobado ? new Date().toISOString() : null };
    setResultado(resultadoCompleto);
    try {
      localStorage.setItem(claveResultado(token, microcursoId), JSON.stringify(resultadoCompleto));
    } catch {
      // idem arriba: si falla, no rompe el flujo, solo no persiste el refresh.
    }
  }

  // No aprobó: vuelve a la evaluación desde cero (respuestas en blanco),
  // borrando el resultado guardado para que un refresh no lo devuelva a
  // la pantalla de "no aprobado" de antes.
  function handleReintentar() {
    setRespuestas(new Array((curso?.preguntas || []).length).fill(null));
    setResultado(null);
    try {
      localStorage.removeItem(claveResultado(token, microcursoId));
    } catch {
      // no-op
    }
    setEnEvaluacion(true);
  }

  async function handleConfirmarAcuse() {
    if (!acuseChecked || enviandoAcuse) return;
    setEnviandoAcuse(true);
    setErrorAcuse(null);

    const base = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      const res = await fetch(`${base}/functions/v1/confirmar-acuse`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, microcurso_id: microcursoId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorAcuse(data.error || 'No se pudo confirmar el acuse. Probá de nuevo.');
        return;
      }
      setAcuseFecha(data.fecha);
    } catch {
      setErrorAcuse('No se pudo confirmar el acuse. Probá de nuevo.');
    } finally {
      setEnviandoAcuse(false);
    }
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
      <div className="max-w-md sm:max-w-xl mx-auto mt-24 px-4 sm:px-0 text-center">
        <p className="text-[#C1502E] font-semibold">{error}</p>
        <a href={`/empleado?token=${token}`} className="text-sm text-[#6b6455] underline mt-2 inline-block">
          Volver a Mi perfil
        </a>
      </div>
    );
  }

  if (resultado) {
    const esEspecial = esCursoSeguridadEHigiene(curso.titulo);
    // empleado-completar-curso ahora manda `aprobado` calculado en el
    // servidor con el mismo 70% de corte. El fallback de acá es solo por
    // compatibilidad con un resultado viejo que haya quedado guardado en
    // localStorage de antes de este cambio (no tenía el campo `aprobado`).
    const aprobado = resultado.aprobado ?? resultado.puntaje >= 70;
    // Fecha real en que se hizo (y aprobó) el curso — viene del servidor
    // (progreso_empleado.fecha_completado), no del momento en que se
    // confirma o se revisa el acuse, que puede ser bastante después. Las
    // dos fechas se muestran por separado más abajo: esta es "cuándo lo
    // hizo", la del acuse es "cuándo confirmó que lo leyó".
    const fechaRealizacion = resultado.fecha_completado
      ? new Date(resultado.fecha_completado).toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null;
    const tieneDetalleIntento = resultado.correctas != null && resultado.total != null;
    return (
      <div className="max-w-md sm:max-w-xl mx-auto mt-10 px-4 sm:px-0 text-center">
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-8">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b6455] mb-1">
            Completaste
          </p>
          <TituloCurso titulo={curso.titulo} className="mb-5" />

          {aprobado ? (
            <>
              <div className="flex justify-center mb-3">
                {esEspecial ? <BadgeEspecialImg /> : <BadgeCursoImg />}
              </div>
              {esEspecial && (
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#C1502E] mb-3">
                  Badge especial · Seguridad e Higiene
                </p>
              )}
              <h1 className="text-lg font-bold text-[#2C2C2A] mb-3">¡Felicitaciones !!!</h1>
            </>
          ) : (
            <h1 className="text-lg font-bold text-[#C1502E] mb-3">No llegaste al puntaje mínimo</h1>
          )}

          <div
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 ${
              aprobado && fechaRealizacion ? 'mb-1' : 'mb-4'
            }`}
            style={{ background: aprobado ? '#7C8B6F' : '#C1502E' }}
          >
            <span
              className="text-base font-bold tracking-wide text-white"
              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
            >
              {resultado.puntaje}%
            </span>
            {tieneDetalleIntento && (
              <span
                className="text-xs font-semibold text-white"
                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
              >
                · {resultado.correctas}/{resultado.total} correctas
              </span>
            )}
          </div>

          {aprobado && fechaRealizacion && (
            <p className="text-xs text-[#8a8471] mb-4">Realizado el {fechaRealizacion}</p>
          )}

          {!aprobado && (
            <p className="text-sm text-[#6b6455] mb-4">
              Necesitás al menos 70% para aprobar este curso. Podés volver a intentarlo cuando quieras.
            </p>
          )}

          {esEspecial && aprobado && (
            <div className="text-left bg-[#FBF7EA] border border-[#EFDDCE] rounded-xl p-4 mb-4">
              {acuseFecha ? (
                <p className="text-sm font-semibold text-[#185FA5]">
                  ✓ Acuse de recibido confirmado el{' '}
                  {new Date(acuseFecha).toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  , {new Date(acuseFecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs.
                </p>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-sm text-[#2C2C2A] font-medium mb-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acuseChecked}
                      onChange={(e) => setAcuseChecked(e.target.checked)}
                      className="mt-0.5 flex-shrink-0 accent-[#6B655A]"
                    />
                    Confirmo que leí y entendí el contenido de este curso de Seguridad e Higiene.
                  </label>
                  {errorAcuse && <p className="text-xs text-[#C1502E] mb-2">{errorAcuse}</p>}
                  <button
                    onClick={handleConfirmarAcuse}
                    disabled={!acuseChecked || enviandoAcuse}
                    className="w-full py-2 rounded-lg font-bold tracking-wide text-white bg-[#6B655A] disabled:bg-[#EFDDCE] disabled:text-[#8a8471] disabled:font-semibold disabled:tracking-normal"
                    style={!acuseChecked || enviandoAcuse ? undefined : { textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                  >
                    {enviandoAcuse ? 'Confirmando...' : 'Confirmar acuse de recibido'}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {aprobado ? (
              <button
                onClick={handleDescargarCertificado}
                disabled={generandoCertificado}
                className="w-full py-2 rounded-lg font-bold tracking-wide text-white bg-[#6B655A] disabled:opacity-60"
                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
              >
                {generandoCertificado ? 'Generando...' : 'Descargar certificado (PDF)'}
              </button>
            ) : (
              <button
                onClick={handleReintentar}
                className="w-full py-2 rounded-lg font-bold tracking-wide text-white bg-[#6B655A]"
                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
              >
                Volver a intentar
              </button>
            )}
            <a
              href={`/empleado?token=${token}`}
              className="inline-block w-full py-2 rounded-lg font-semibold text-white bg-[#C1502E]"
            >
              Volver a Mi perfil
            </a>
          </div>
        </div>
      </div>
    );
  }

  const { titulo, pasos, preguntas } = curso;
  // Antes acá se asumía que "pasos" siempre tenía al menos un elemento:
  // pasos[pasoActual].titulo se leía sin chequear nada. Si un curso queda
  // sin pasos cargados (por ejemplo "Manejo de situaciones difíciles",
  // que se quedaba en blanco al abrirlo), eso tira una excepción durante
  // el render que no cae en ningún catch — React desmonta todo y la
  // pantalla queda en blanco, sin ningún mensaje. Con este chequeo, si no
  // hay pasos pero sí hay evaluación, se va directo a la evaluación; si no
  // hay ninguna de las dos cosas, se avisa en vez de romperse.
  const hayPasos = Array.isArray(pasos) && pasos.length > 0;
  const hayPreguntas = Array.isArray(preguntas) && preguntas.length > 0;

  if (!hayPasos && !hayPreguntas) {
    return (
      <div className="max-w-md sm:max-w-xl mx-auto mt-24 px-4 sm:px-0 text-center">
        <p className="text-[#C1502E] font-semibold mb-4">Este curso todavía no tiene contenido cargado.</p>
        <a
          href={`/empleado?token=${token}`}
          className="inline-block px-5 py-2 rounded-lg font-bold tracking-wide text-white bg-[#6B655A]"
          style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
        >
          Volver a Mi perfil
        </a>
      </div>
    );
  }

  // Evaluación (o directo acá si el curso no tiene pasos, solo evaluación)
  if (enEvaluacion || !hayPasos) {
    const todasRespondidas = respuestas.every((r) => r !== null);
    return (
      <div className="max-w-md sm:max-w-2xl mx-auto mt-8 px-4 sm:px-0 pb-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-1">Evaluación</p>
        <TituloCurso titulo={titulo} className="mb-6" />

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
                      className="accent-[#C1502E]"
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
    <div className="max-w-md sm:max-w-2xl mx-auto mt-8 px-4 sm:px-0 pb-16">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-1">
        Paso {pasoActual + 1} de {pasos.length}
      </p>
      <TituloCurso titulo={titulo} className="mb-4" />

      <div className="w-full h-1.5 bg-[#EDE0C8] rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-[#C1502E] rounded-full"
          style={{ width: `${((pasoActual + 1) / pasos.length) * 100}%` }}
        />
      </div>

      <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6 sm:p-8">
        <h2 className="font-bold text-[#2C2C2A] text-base sm:text-lg mb-3">{paso.titulo}</h2>
        <ContenidoPaso texto={paso.contenido} />
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
            className="w-full py-2 rounded-lg font-bold tracking-wide text-white bg-[#6B655A]"
            style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
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

export default function CursoDetalle() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  return (
    <PinGate token={token}>
      <CursoDetalleInterno />
    </PinGate>
  );
}
