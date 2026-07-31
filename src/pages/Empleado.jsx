import { useEffect, useState } from 'react';

export default function Empleado() {
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

  return (
    <div className="max-w-md mx-auto mt-10 px-4">
      <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6 mb-4">
        <h1 className="text-lg font-bold text-[#2C2C2A] mb-1">
          Hola, {datos.empleado.nombre}
        </h1>
        <p className="text-sm text-[#6b6455]">
          {datos.negocio.nombre} · {datos.cuenta.nombre}
        </p>
      </div>

      <div className="space-y-3">
        {datos.microcursos.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6 text-center">
            <p className="text-sm text-[#6b6455]">
              Todavía no hay microcursos cargados para vos. Consultá con tu encargado.
            </p>
          </div>
        )}

        {datos.microcursos.map((m) => (
          <div
            key={m.id}
            className="bg-white rounded-2xl border border-[#EFDDCE] p-4 flex items-center justify-between"
          >
            <div>
              <p className="font-semibold text-[#2C2C2A]">{m.titulo}</p>
              <p className="text-xs text-[#6b6455]">
                {m.duracion_min ? `${m.duracion_min} min` : ''}
              </p>
            </div>
            {m.completado ? (
              <span className="text-xs font-semibold text-[#3F7D5C]">Completado</span>
            ) : (
              <span className="text-xs font-semibold text-[#C1502E]">Pendiente</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
