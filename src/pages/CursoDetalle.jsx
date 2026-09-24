import { useEffect, useState } from 'react';
import { generarCertificadoPDF } from '../lib/certificado';
import { esCursoSeguridadEHigiene, BadgeCursoImg, BadgeEspecialImg } from '../components/Badges';
import PinGate, { usePinEmpleado } from '../components/PinGate';

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

// Clave de localStorage que se usaba antes para recordar el resultado de
// un curso en este navegador. 2026-09-24: ya no se usa (el servidor manda
// el progreso de la versión actual, y un resultado guardado acá podía ser
// de una versión vieja del curso). Solo se borra si quedó de antes.
function claveResultadoViejo(token, microcursoId) {
  return `inductoria-resultado:${token}:${microcursoId}`;
}

function borrarResultadoViejo(token, microcursoId) {
  try {
    localStorage.removeItem(claveResultadoViejo(token, microcursoId));
  } catch {
    // no-op
  }
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
  const microcursoId = params.get('curso');
  // token + PIN los maneja PinGate (fetchEmpleado los manda solos).
  const { token, fetchEmpleado } = usePinEmpleado();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [curso, setCurso] = useState(null);

  const [pasoActual, setPasoActual] = useState(0);
  const [enEvaluacion, setEnEvaluacion] = useState(false);
  const [respuestas, setRespuestas] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
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

  // Datos de Mi perfil (nombre para el certificado, y si la cuenta tiene
  // el chat de dudas con IA). null mientras carga; 'error' si no se pudo.
  const [datosEmpleado, setDatosEmpleado] = useState(null);
  const [generandoCertificado, setGenerandoCertificado] = useState(false);

  useEffect(() => {
    if (!microcursoId) {
      setError('Falta información en el link.');
      setLoading(false);
      return;
    }

    let cancelado = false;
    borrarResultadoViejo(token, microcursoId);

    fetchEmpleado('empleado-curso', { query: { microcurso_id: microcursoId } })
      .then(({ ok, data, pinInvalido }) => {
        if (cancelado || pinInvalido) return;
        if (!ok) {
          setError(data.error || 'No se pudo cargar el curso.');
          return;
        }
        setCurso(data);
        setRespuestas(new Array((data.preguntas || []).length).fill(null));

        // El servidor es la fuente de verdad del progreso de este empleado
        // en la versión ACTUAL del curso (una fila por versión en
        // progreso_empleado). Si ya la rindió (apruebe o no, desde
        // cualquier dispositivo) reconstruimos acá la pantalla de
        // resultado; eso permite volver a entrar para confirmar un acuse
        // pendiente o bajar el certificado. Si solo completó una versión
        // anterior, `progreso` viene null y se muestra el curso nuevo.
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
        }
      })
      .catch(() => {
        if (!cancelado) setError('No se pudo cargar el curso. Revisá tu conexión y probá de nuevo.');
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    // En paralelo: nombre del empleado (certificado) y si hay chat de IA.
    fetchEmpleado('empleado-info')
      .then(({ ok, data, pinInvalido }) => {
        if (cancelado || pinInvalido) return;
        setDatosEmpleado(ok ? data : 'error');
      })
      .catch(() => {
        if (!cancelado) setDatosEmpleado('error');
      });

    return () => {
      cancelado = true;
    };
  }, [token, microcursoId, fetchEmpleado]);

  const nombreEmpleado = datosEmpleado && datosEmpleado !== 'error' ? datosEmpleado.empleado?.nombre : null;
  const iaDisponible = !!(datosEmpleado && datosEmpleado !== 'error' && datosEmpleado.ia_disponible);

  function handleDescargarCertificado() {
    // Sin el nombre real no se genera: antes salía "Empleado" si los
    // datos todavía no habían llegado.
    if (!resultado || !curso || !nombreEmpleado) return;
    setGenerandoCertificado(true);

    try {
      generarCertificadoPDF({
        nombreEmpleado,
        negocioNombre: datosEmpleado?.negocio?.nombre || '',
        tituloCurso: curso.titulo,
        puntaje: resultado.puntaje,
        // Fecha en que aprobó (viene del servidor), no la de hoy.
        fechaCompletado: resultado.fecha_completado,
      });
    } finally {
      setGenerandoCertificado(false);
    }
  }

  async function handleEnviarEvaluacion() {
    if (enviando) return;
    setEnviando(true);
    setErrorEnvio(null);

    // Si algo falla, las respuestas quedan en pantalla y se avisa para
    // reintentar (antes un error reemplazaba toda la página, o el botón
    // quedaba en "Enviando..." para siempre si se cortaba la red).
    try {
      const { ok, data, pinInvalido } = await fetchEmpleado('empleado-completar-curso', {
        method: 'POST',
        body: { microcurso_id: microcursoId, respuestas },
      });
      if (pinInvalido) return;
      if (!ok) {
        setErrorEnvio(data.error || 'No pudimos guardar tu resultado. Tus respuestas siguen acá, probá de nuevo.');
        return;
      }
      setResultado({
        puntaje: data.puntaje,
        correctas: data.correctas,
        total: data.total,
        aprobado: data.aprobado,
        // La manda el servidor (momento real en que aprobó). Si por algún
        // motivo no viniera, se usa ahora solo si aprobó.
        fecha_completado: data.fecha_completado ?? (data.aprobado ? new Date().toISOString() : null),
      });
      // Una versión nueva aprobada todavía no tiene acuse.
      setAcuseFecha(null);
      setAcuseChecked(false);
    } catch {
      setErrorEnvio('No pudimos enviar tus respuestas. Revisá tu conexión y probá de nuevo, no se borraron.');
    } finally {
      setEnviando(false);
    }
  }

  // No aprobó: vuelve a la evaluación desde cero (respuestas en blanco).
  function handleReintentar() {
    setRespuestas(new Array((curso?.preguntas || []).length).fill(null));
    setResultado(null);
    setErrorEnvio(null);
    setEnEvaluacion(true);
  }

  async function handleConfirmarAcuse() {
    if (!acuseChecked || enviandoAcuse) return;
    setEnviandoAcuse(true);
    setErrorAcuse(null);

    try {
      const { ok, data, pinInvalido } = await fetchEmpleado('confirmar-acuse', {
        method: 'POST',
        body: { microcurso_id: microcursoId },
      });
      if (pinInvalido) return;

      if (!ok) {
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

    try {
      const { ok, data, pinInvalido } = await fetchEmpleado('preguntar-curso', {
        method: 'POST',
        body: { microcurso_id: microcursoId, pregunta: preguntaActual },
      });
      if (pinInvalido) return;

      if (!ok) {
        setErrorChat(data.error || 'No se pudo enviar la pregunta.');
        if (data.limite) setPreguntasRestantes(0);
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
    // `aprobado` lo calcula el servidor con el mismo 70% de corte; el
    // fallback es solo por si faltara el campo.
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
                <p className="text-sm font-semibold text-[#2C2C2A]">
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
              <>
                <button
                  onClick={handleDescargarCertificado}
                  disabled={generandoCertificado || !nombreEmpleado}
                  className="w-full py-2 rounded-lg font-bold tracking-wide text-white bg-[#6B655A] disabled:opacity-60"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                >
                  {generandoCertificado
                    ? 'Generando...'
                    : !datosEmpleado
                      ? 'Preparando certificado...'
                      : 'Descargar certificado (PDF)'}
                </button>
                {datosEmpleado === 'error' && (
                  <p className="text-xs text-[#C1502E]">
                    No pudimos cargar tus datos para el certificado. Recargá la página para probar de nuevo.
                  </p>
                )}
              </>
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

  // Completó una versión anterior de este curso pero no la actual: se le
  // avisa por qué tiene que volver a hacerlo.
  const avisoVersionNueva = curso.version_anterior_completada ? (
    <div className="bg-[#FBF7EA] border border-[#EFDDCE] rounded-xl p-3 mb-5 text-sm text-[#3d382c] font-medium">
      Este curso se actualizó desde la última vez que lo hiciste. Revisalo de nuevo y hacé la evaluación para
      tenerlo al día.
    </div>
  ) : null;
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
        {avisoVersionNueva}

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

        {errorEnvio && <p className="text-sm text-[#C1502E] mt-6 -mb-3">{errorEnvio}</p>}

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
      {avisoVersionNueva}

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

      {/* El chat de dudas usa IA: solo se muestra si la cuenta lo tiene
          habilitado (mismo criterio que preguntar-curso). */}
      {iaDisponible && (
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
                {preguntasRestantes > 1
                  ? `Te quedan ${preguntasRestantes} preguntas hoy.`
                  : preguntasRestantes === 1
                    ? 'Te queda 1 pregunta hoy.'
                    : 'Llegaste al límite de preguntas de hoy.'}
              </p>
            )}
          </div>
        )}
      </div>
      )}
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
