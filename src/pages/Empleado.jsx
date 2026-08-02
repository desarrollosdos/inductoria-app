import { useEffect, useState } from 'react';

function Avatar({ nombre, fotoUrl, size = 72 }) {
  const estilo = { width: size, height: size, border: '2px solid #C1502E' };
  if (fotoUrl) {
    return <img src={fotoUrl} alt={nombre} style={estilo} className="rounded-full object-cover" />;
  }
  return (
    <div
      style={estilo}
      className="rounded-full bg-[#EDE0C8] text-[#C1502E] font-bold flex items-center justify-center text-2xl"
    >
      {nombre.charAt(0).toUpperCase()}
    </div>
  );
}

function IconBadge(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="6" />
      <path d="M9 14 6.5 21 12 18l5.5 3L15 14" />
    </svg>
  );
}

export default function Empleado({ onDatosCargados }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [datos, setDatos] = useState(null);

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  useEffect(() => {
    if (!token) {
      setError('Falta el token de acceso en el link.');
      setLoading(false);
      return;
    }

    const base = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    fetch(`${base}/functions/v1/empleado-info?token=${encodeURIComponent(token)}`, {
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || 'No se pudo cargar tu información.');
          return;
        }
        setDatos(data);
        if (onDatosCargados) onDatosCargados(data.empleado.nombre);
      })
      .catch(() => setError('No se pudo cargar tu información.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <p className="text-center mt-24 text-[#6b6455]">Cargando...</p>;
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-24 px-4 text-center">
        <p className="text-[#C1502E] font-semibold">{error}</p>
        <p className="text-sm text-[#6b6455] mt-2">
          Pedile a tu encargado que te reenvíe el link de acceso.
        </p>
      </div>
    );
  }

  const { empleado, negocio, cuenta, microcursos } = datos;
  const completados = microcursos.filter((m) => m.completado);
  const pendientes = microcursos.filter((m) => !m.completado);

  return (
    <div className="max-w-2xl mx-auto mt-4 px-4 pb-16">
      {/* Perfil */}
      <div className="bg-[#FBEAE3] rounded-2xl border border-[#F3D5C7] p-6 mb-6 flex items-center gap-4">
        <Avatar nombre={empleado.nombre} fotoUrl={empleado.foto_url} />
        <div>
          <h1 className="text-lg font-bold text-[#2C2C2A]">{empleado.nombre}</h1>
          <p className="text-sm font-medium text-[#3d382c]">
            {empleado.puesto ? `${empleado.puesto} · ` : ''}
            {negocio.nombre} · {cuenta.nombre}
          </p>
          <p className="text-xs font-semibold text-[#5c5647] mt-1">
            <span className="text-[#C1502E]">{completados.length}</span>
            <span className="text-[#C1502E]">/</span>
            <span className="text-[#C1502E]">{microcursos.length}</span>
            {' '}curso{microcursos.length === 1 ? '' : 's'} completado
            {completados.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {microcursos.length === 0 && (
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6 text-center">
          <p className="text-sm text-[#6b6455]">
            Todavía no hay cursos cargados para vos. Consultá con tu encargado.
          </p>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#8a8471] mb-2">Pendientes</h2>
          <div className="space-y-2">
            {pendientes.map((m) => {
              const vencido = m.fecha_limite && new Date(m.fecha_limite) < new Date();
              return (
                <div key={m.id} className="bg-white rounded-2xl border border-[#EFDDCE] p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#2C2C2A]">{m.titulo}</p>
                    <p className="text-xs text-[#8a8471]">
                      {m.duracion_min ? `${m.duracion_min} min` : ''}
                      {m.fecha_limite && (
                        <span className={vencido ? 'text-[#C1502E] font-semibold' : ''}>
                          {m.duracion_min ? ' · ' : ''}
                          {vencido ? 'Venció el ' : 'Hasta el '}
                          {new Date(m.fecha_limite).toLocaleDateString('es-AR')}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-white bg-[#D69A2D] rounded-full px-3 py-1 flex-shrink-0">
                    Pendiente
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {completados.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#8a8471] mb-2">Completados</h2>
          <div className="space-y-2">
            {completados.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl border border-[#EFDDCE] p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-[#eef9f4] text-[#1D9E75] flex items-center justify-center flex-shrink-0">
                    <IconBadge />
                  </span>
                  <div>
                    <p className="font-semibold text-[#2C2C2A]">{m.titulo}</p>
                    <p className="text-xs text-[#8a8471]">
                      {m.fecha_completado
                        ? `Completado el ${new Date(m.fecha_completado).toLocaleDateString('es-AR')}`
                        : 'Completado'}
                      {m.puntaje != null && ` · ${m.puntaje}%`}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#1D9E75]">✓</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
