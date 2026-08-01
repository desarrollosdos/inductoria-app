import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';

function IconEmpleadosMini(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
      <circle cx="17.5" cy="8.5" r="2.4" />
      <path d="M15.5 14.3c2.6.3 4.5 2.5 4.5 5.2" />
    </svg>
  );
}

function IconCamara(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

// Recorta la foto a un cuadrado (centrado), listo para mostrar en círculo.
function recortarACuadrado(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const lado = Math.min(img.width, img.height);
        const sx = (img.width - lado) / 2;
        const sy = (img.height - lado) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, lado, lado, 0, 0, 400, 400);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Avatar({ e, size = 36 }) {
  const estilo = { width: size, height: size };
  if (e.foto_url) {
    return (
      <img
        src={e.foto_url}
        alt={e.nombre}
        style={estilo}
        className="rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div
      style={estilo}
      className="rounded-full bg-[#EDE0C8] text-[#8a8471] font-bold flex items-center justify-center flex-shrink-0 text-sm"
    >
      {e.nombre.charAt(0).toUpperCase()}
    </div>
  );
}

export default function Empleados({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState('alfabetico'); // 'alfabetico' | 'sucursal'

  const [negocioSeleccionado, setNegocioSeleccionado] = useState('');
  const [nombreEmpleado, setNombreEmpleado] = useState('');
  const [puesto, setPuesto] = useState('');
  const [telefonoEmpleado, setTelefonoEmpleado] = useState('');
  const [mailEmpleado, setMailEmpleado] = useState('');
  const [fotoBlob, setFotoBlob] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const fileInputCamaraRef = useRef(null);
  const fileInputGaleriaRef = useRef(null);

  const [creando, setCreando] = useState(false);
  const [ultimoLink, setUltimoLink] = useState(null);

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarTodo() {
    setLoading(true);

    const { data: cuentaData } = await supabase
      .from('cuentas')
      .select('*')
      .eq('owner_id', session.user.id)
      .maybeSingle();
    setCuenta(cuentaData);

    if (cuentaData) {
      const { data: negociosData } = await supabase
        .from('negocios')
        .select('*')
        .eq('cuenta_id', cuentaData.id)
        .order('nombre', { ascending: true });
      setNegocios(negociosData || []);

      const negocioIds = (negociosData || []).map((n) => n.id);
      if (negocioIds.length > 0) {
        const { data: empleadosData } = await supabase
          .from('empleados')
          .select('*')
          .in('negocio_id', negocioIds)
          .order('nombre', { ascending: true });
        setEmpleados(empleadosData || []);
      }
    }

    setLoading(false);
  }

  async function handleFotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setProcesandoFoto(true);
    try {
      const blob = await recortarACuadrado(file);
      setFotoBlob(blob);
      setFotoPreview(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
    }
    setProcesandoFoto(false);
  }

  async function handleCrearEmpleado(e) {
    e.preventDefault();
    if (!nombreEmpleado.trim() || !negocioSeleccionado) return;
    setCreando(true);
    setUltimoLink(null);

    let fotoUrl = null;
    if (fotoBlob) {
      const nombreArchivo = `${cuenta.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('fotos-empleados')
        .upload(nombreArchivo, fotoBlob, { contentType: 'image/jpeg' });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('fotos-empleados').getPublicUrl(nombreArchivo);
        fotoUrl = urlData.publicUrl;
      } else {
        console.error('No se pudo subir la foto:', uploadError);
      }
    }

    const { data, error } = await supabase
      .from('empleados')
      .insert({
        negocio_id: negocioSeleccionado,
        nombre: nombreEmpleado.trim(),
        puesto: puesto.trim() || null,
        telefono: telefonoEmpleado.trim() || null,
        mail: mailEmpleado.trim() || null,
        foto_url: fotoUrl,
      })
      .select()
      .single();

    setCreando(false);
    if (error) {
      console.error(error);
      return;
    }

    const link = `${window.location.origin}/empleado?token=${data.token_acceso}`;
    setUltimoLink(link);
    setNombreEmpleado('');
    setPuesto('');
    setTelefonoEmpleado('');
    setMailEmpleado('');
    setFotoBlob(null);
    setFotoPreview(null);
    setEmpleados([...empleados, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
  }

  async function handleBaja(empleadoId) {
    const { error } = await supabase
      .from('empleados')
      .update({ fecha_baja: new Date().toISOString() })
      .eq('id', empleadoId);
    if (error) {
      console.error(error);
      return;
    }
    setEmpleados(
      empleados.map((e) => (e.id === empleadoId ? { ...e, fecha_baja: new Date().toISOString() } : e))
    );
  }

  function nombreNegocio(negocioId) {
    return negocios.find((n) => n.id === negocioId)?.nombre || '—';
  }

  if (loading) {
    return <p className="text-center mt-24 text-[#6b6455]">Cargando...</p>;
  }

  if (!cuenta) {
    return (
      <div>
        <DashboardNav userEmail={session.user.email} />
        <div className="text-center mt-12 px-4">
          <p className="text-[#6b6455] mb-3">Primero cargá el nombre de tu negocio.</p>
          <a href="/sucursales" className="inline-block px-5 py-2 rounded-lg font-semibold text-white bg-[#C1502E]">
            Ir a Sucursales
          </a>
        </div>
      </div>
    );
  }

  const activos = empleados.filter((e) => !e.fecha_baja);
  const dadosDeBaja = empleados.filter((e) => e.fecha_baja);

  function FilaEmpleado({ e }) {
    return (
      <div className="flex items-center justify-between border-b border-[#EDE0C8] pb-2 last:border-0">
        <div className="flex items-center gap-3">
          <Avatar e={e} />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#2C2C2A]">{e.nombre}</p>
              {e.puesto && (
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-[#EDE0C8] text-[#C1502E] px-2 py-0.5 rounded-full">
                  {e.puesto}
                </span>
              )}
            </div>
            <p className="text-xs text-[#8a8471]">
              {nombreNegocio(e.negocio_id)} · alta {new Date(e.fecha_alta).toLocaleDateString('es-AR')}
            </p>
          </div>
        </div>
        <button onClick={() => handleBaja(e.id)} className="text-xs font-semibold text-[#C1502E] hover:underline flex-shrink-0">
          Dar de baja
        </button>
      </div>
    );
  }

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <EstadoBar
        session={session}
        icon={IconEmpleadosMini}
        label="Empleados"
        right={
          <span className="w-7 h-7 rounded-full bg-[#C1502E] text-white font-bold text-sm flex items-center justify-center">
            {empleados.length}
          </span>
        }
      />
      <div className="max-w-4xl mx-auto mt-4 px-4 pb-16 space-y-6">
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h2 className="font-semibold text-[#2C2C2A] mb-3">Dar de alta un empleado</h2>

          {negocios.length === 0 ? (
            <p className="text-sm text-[#6b6455]">
              Primero cargá al menos una sucursal, en la pantalla de Sucursales.
            </p>
          ) : (
            <form onSubmit={handleCrearEmpleado} className="space-y-2">
              <div className="flex items-center gap-3 mb-1">
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  ref={fileInputCamaraRef}
                  onChange={handleFotoChange}
                  className="hidden"
                />
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputGaleriaRef}
                  onChange={handleFotoChange}
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-full bg-[#EDE0C8] flex items-center justify-center overflow-hidden flex-shrink-0 border-2 border-dashed border-[#C1502E]">
                  {fotoPreview ? (
                    <img src={fotoPreview} alt="Foto" className="w-full h-full object-cover" />
                  ) : (
                    <IconCamara className="text-[#C1502E]" />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputCamaraRef.current.click()}
                      disabled={procesandoFoto}
                      className="text-xs font-semibold text-[#C1502E] border border-[#C1502E] rounded-full px-3 py-1"
                    >
                      Tomar foto
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputGaleriaRef.current.click()}
                      disabled={procesandoFoto}
                      className="text-xs font-semibold text-[#8a8471] border border-[#EDE0C8] rounded-full px-3 py-1"
                    >
                      Elegir de galería
                    </button>
                  </div>
                  <span className="text-xs text-[#8a8471]">
                    {procesandoFoto ? 'Procesando...' : fotoPreview ? 'Foto lista' : 'Opcional'}
                  </span>
                </div>
              </div>
              <select
                value={negocioSeleccionado}
                onChange={(e) => setNegocioSeleccionado(e.target.value)}
                required
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="">Elegí la sucursal</option>
                {negocios.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nombre}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                value={nombreEmpleado}
                onChange={(e) => setNombreEmpleado(e.target.value)}
                placeholder="Nombre del empleado"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <input
                type="text"
                required
                value={puesto}
                onChange={(e) => setPuesto(e.target.value)}
                placeholder="Puesto (ej: cajera, vendedora, mesera)"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <input
                type="tel"
                value={telefonoEmpleado}
                onChange={(e) => setTelefonoEmpleado(e.target.value)}
                placeholder="Teléfono"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <input
                type="email"
                value={mailEmpleado}
                onChange={(e) => setMailEmpleado(e.target.value)}
                placeholder="Mail"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={creando || !negocioSeleccionado || !nombreEmpleado.trim() || !puesto.trim()}
                className="w-full py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:bg-[#EFDDCE] disabled:text-[#8a8471]"
              >
                {creando ? 'Creando...' : 'Dar de alta'}
              </button>
            </form>
          )}

          {ultimoLink && (
            <div className="mt-4 bg-[#EDE0C8] border border-[#EFDDCE] rounded-lg p-3 text-sm">
              <p className="text-[#2C2C2A] mb-1 font-semibold">Mandale este link al empleado:</p>
              <p className="text-[#3d382c] break-all">{ultimoLink}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[#2C2C2A]">Empleados activos ({activos.length})</h2>
            <div className="flex gap-1 bg-[#EDE0C8] rounded-lg p-1">
              <button
                onClick={() => setVista('alfabetico')}
                className={`text-xs font-semibold px-3 py-1 rounded-md ${
                  vista === 'alfabetico' ? 'bg-white text-[#2C2C2A]' : 'text-[#8a8471]'
                }`}
              >
                A-Z
              </button>
              <button
                onClick={() => setVista('sucursal')}
                className={`text-xs font-semibold px-3 py-1 rounded-md ${
                  vista === 'sucursal' ? 'bg-white text-[#2C2C2A]' : 'text-[#8a8471]'
                }`}
              >
                Por sucursal
              </button>
            </div>
          </div>

          {activos.length === 0 ? (
            <p className="text-sm text-[#6b6455]">Todavía no diste de alta a nadie.</p>
          ) : vista === 'alfabetico' ? (
            <div className="space-y-2">
              {activos.map((e) => (
                <FilaEmpleado key={e.id} e={e} />
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {negocios.map((n) => {
                const deEstaSucursal = activos.filter((e) => e.negocio_id === n.id);
                if (deEstaSucursal.length === 0) return null;
                return (
                  <div key={n.id}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-2">
                      {n.nombre}
                    </p>
                    <div className="space-y-2">
                      {deEstaSucursal.map((e) => (
                        <FilaEmpleado key={e.id} e={e} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {dadosDeBaja.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
            <h2 className="font-semibold text-[#8a8471] mb-3">Dados de baja ({dadosDeBaja.length})</h2>
            <div className="space-y-2">
              {dadosDeBaja.map((e) => (
                <div key={e.id} className="flex items-center gap-3 border-b border-[#EDE0C8] pb-2 last:border-0">
                  <Avatar e={e} size={28} />
                  <div className="flex-1 flex items-center justify-between">
                    <p className="text-sm text-[#8a8471]">{e.nombre}</p>
                    <p className="text-xs text-[#8a8471]">baja {new Date(e.fecha_baja).toLocaleDateString('es-AR')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
