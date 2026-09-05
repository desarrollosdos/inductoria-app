import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';
import SuscripcionRequeridaModal from '../components/SuscripcionRequeridaModal';
import TrialBanner from '../components/TrialBanner';
import { TRIAL_DIAS, tieneAccesoBase, trialActivo, CUENTAS_EXENTAS } from '../lib/acceso';
import { precioTotalMensual } from '../lib/precio';
import { capitalizarPalabras } from '../lib/texto';

function IconSucursalesMini(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

// Cuánto puede llegar a cargar de sucursales ahora mismo. Durante el
// trial (salvo cuentas exentas) el tope es siempre 1, sin importar lo
// que se haya declarado en sucursales_contratadas al crear la cuenta:
// ese número solo determina el precio del día que se suscriba
// (crear-suscripcion). Fuera del trial (activa, past_due, o cuenta
// exenta) el tope es directamente lo contratado — nunca hay una
// excepción automática que deje crear gratis más de lo declarado/
// pagado; para una cuenta exenta de prueba, lo contratado se sube a
// mano desde Supabase.
function limiteSucursales(cuenta, email) {
  const contratadas = cuenta.sucursales_contratadas || 1;
  if (trialActivo(cuenta) && !CUENTAS_EXENTAS.includes(email)) {
    return Math.min(1, contratadas);
  }
  return contratadas;
}

const FORM_VACIO = {
  nombre: '',
  direccion: '',
  localidad: '',
  provincia: '',
  codigo_postal: '',
  telefono: '',
  mail: '',
};

function CamposDireccion({ form, setForm }) {
  return (
    <>
      <input
        type="text"
        required
        value={form.nombre}
        onChange={(e) => setForm({ ...form, nombre: e.target.value })}
        placeholder="Nombre de la sucursal (ej: Local Palermo)"
        className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
      />
      <input
        type="text"
        required
        value={form.direccion}
        onChange={(e) => setForm({ ...form, direccion: e.target.value })}
        placeholder="Dirección (calle y número)"
        className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
      />
      <input
        type="text"
        required
        value={form.localidad}
        onChange={(e) => setForm({ ...form, localidad: e.target.value })}
        placeholder="Localidad"
        className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          required
          value={form.provincia}
          onChange={(e) => setForm({ ...form, provincia: e.target.value })}
          placeholder="Provincia"
          className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
        />
        <input
          type="text"
          value={form.codigo_postal}
          onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })}
          placeholder="Código postal (opcional)"
          className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
        />
      </div>
      <input
        type="tel"
        required
        value={form.telefono}
        onChange={(e) => setForm({ ...form, telefono: e.target.value })}
        placeholder="Teléfono"
        className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
      />
      <input
        type="email"
        required
        value={form.mail}
        onChange={(e) => setForm({ ...form, mail: e.target.value })}
        placeholder="Mail de contacto"
        className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
      />
    </>
  );
}

// Self-service: sumar 1 sucursal más a un plan pago ya activo. Sube el
// monto de la suscripción en MercadoPago (Edge Function
// agregar-sucursal-plan) y recién con eso confirmado destraba el cupo.
// Solo se muestra cuando cuenta.plan === 'active' y sin cancelación
// pendiente (ver el punto de montaje más abajo); para cualquier otro
// estado (past_due, suspended, cancelled) se sigue mostrando el cartel
// de "comunicate con nosotros".
function AgregarSucursalPlan({ cuenta, negocios, precioBase, onAgregada }) {
  const [confirmando, setConfirmando] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [textoConfirmacion, setTextoConfirmacion] = useState('');

  const cantidadActual = Math.max(negocios.length, cuenta.sucursales_contratadas || 1);
  const cantidadNueva = cantidadActual + 1;
  const precioActual = precioTotalMensual(cantidadActual, precioBase);
  const precioNuevo = precioTotalMensual(cantidadNueva, precioBase);

  async function handleAgregar() {
    setLoading(true);
    setError('');

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agregar-sucursal-plan`,
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
        setError(data.error || 'No se pudo actualizar el plan. Intentá de nuevo.');
        setLoading(false);
        return;
      }
      setLoading(false);
      setConfirmando(false);
      setTextoConfirmacion('');
      onAgregada?.();
    } catch (err) {
      console.error(err);
      setError('Error de conexión. Intentá de nuevo.');
      setLoading(false);
    }
  }

  const confirmacionEscritaOk = textoConfirmacion.trim().toUpperCase() === 'CONFIRMAR';

  if (!confirmando) {
    return (
      <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-lg p-3 text-sm text-[#2C4A3A] flex items-center justify-between gap-3">
        <span className="font-semibold tracking-wide">
          Informaste en tu plan que tendrías {cuenta.sucursales_contratadas} sucursal
          {cuenta.sucursales_contratadas === 1 ? '' : 'es'}. Podés sumar una más ahora mismo.
        </span>
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-3 py-1 flex-shrink-0"
          style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
        >
          Agregar sucursal
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455] space-y-2">
      <p>
        Vas a pasar de {cantidadActual} a {cantidadNueva} sucursal{cantidadNueva === 1 ? '' : 'es'}.
        Tu plan pasa de ${precioActual.toLocaleString('es-AR')}/mes a{' '}
        <strong className="text-[#2C2C2A]">${precioNuevo.toLocaleString('es-AR')}/mes</strong>, desde
        tu próximo cobro.
      </p>
      <div>
        <label className="block text-xs font-semibold text-[#2C2C2A] mb-1">
          Para confirmar, escribí CONFIRMAR
        </label>
        <input
          type="text"
          value={textoConfirmacion}
          onChange={(e) => setTextoConfirmacion(e.target.value)}
          placeholder="CONFIRMAR"
          className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
        />
      </div>
      {error && <p className="text-xs text-[#C1502E]">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setConfirmando(false);
            setTextoConfirmacion('');
          }}
          disabled={loading}
          className="flex-1 py-2 rounded-lg font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8] disabled:opacity-60"
        >
          Volver
        </button>
        <button
          type="button"
          onClick={handleAgregar}
          disabled={loading || !confirmacionEscritaOk}
          className="flex-1 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E] disabled:opacity-60"
          style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
        >
          {loading ? 'Actualizando...' : 'Confirmar'}
        </button>
      </div>
    </div>
  );
}

export default function Dashboard({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [precioBase, setPrecioBase] = useState(12000);
  const [loading, setLoading] = useState(true);
  const [nombreCuenta, setNombreCuenta] = useState('');
  const [sucursalesIniciales, setSucursalesIniciales] = useState('1');
  const [creandoCuenta, setCreandoCuenta] = useState(false);

  const [form, setForm] = useState(FORM_VACIO);
  const [creandoNegocio, setCreandoNegocio] = useState(false);
  const [errorCupo, setErrorCupo] = useState(null);
  // Alta de sucursal (formulario simple, dentro del cupo ya contratado): 3 pasos
  // con opción de cancelar en cualquiera de ellos. 'inicial' = cartel verde con el
  // botón "Agregar sucursal"; 'confirmar' = "¿estás seguro?"; 'validar' = tipear
  // una palabra para confirmar; 'formulario' = carga de datos de la sucursal.
  const [pasoAltaSucursal, setPasoAltaSucursal] = useState('inicial');
  const [textoValidacionAlta, setTextoValidacionAlta] = useState('');

  const [editandoId, setEditandoId] = useState(null);
  const [formEdit, setFormEdit] = useState(FORM_VACIO);
  const [guardandoEdit, setGuardandoEdit] = useState(false);

  const [mostrarSuscripcion, setMostrarSuscripcion] = useState(false);

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
        .order('created_at', { ascending: true });
      setNegocios(negociosData || []);
    }

    const { data: configData } = await supabase
      .from('configuracion_precio')
      .select('precio_base')
      .eq('id', 1)
      .maybeSingle();
    if (configData) setPrecioBase(configData.precio_base);

    setLoading(false);
  }

  async function handleCrearCuenta(e) {
    e.preventDefault();
    if (!nombreCuenta.trim()) return;
    setCreandoCuenta(true);

    // Cuenta nueva arranca en trial: TRIAL_DIAS días de acceso completo,
    // sin tope de empleados, pero SÍ con tope de 1 sucursal durante el
    // trial (ver cupoLleno más abajo) aunque acá se declare un número
    // mayor. Lo que se declara acá queda guardado en
    // sucursales_contratadas y es lo que determina el precio cuando se
    // suscriba (crear-suscripcion), así el cobro queda validado de
    // antemano en vez de calcularse recién en base a lo que haya
    // llegado a cargar gratis. Generar/actualizar cursos con IA queda
    // bloqueado en trial sin importar esto, hasta que se suscriba.
    const trialEndsAt = new Date(Date.now() + TRIAL_DIAS * 24 * 60 * 60 * 1000).toISOString();
    const sucursalesDeclaradas = Math.max(1, parseInt(sucursalesIniciales, 10) || 1);

    const { data, error } = await supabase
      .from('cuentas')
      .insert({
        owner_id: session.user.id,
        nombre: nombreCuenta.trim(),
        plan: 'trial',
        trial_ends_at: trialEndsAt,
        sucursales_contratadas: sucursalesDeclaradas,
      })
      .select()
      .single();

    setCreandoCuenta(false);
    if (error) {
      console.error(error);
      return;
    }
    setCuenta(data);
  }

  async function handleCrearNegocio(e) {
    e.preventDefault();
    setErrorCupo(null);

    if (!hasAccess) {
      setMostrarSuscripcion(true);
      return;
    }

    if (negocios.length >= limiteSucursales(cuenta, session.user.email)) {
      setErrorCupo(
        trialActivo(cuenta) && !CUENTAS_EXENTAS.includes(session.user.email)
          ? 'Durante la prueba gratis podés cargar 1 sucursal. Suscribite para cargar el resto que declaraste.'
          : `Informaste en tu plan que tendrías ${cuenta.sucursales_contratadas} sucursal${
              cuenta.sucursales_contratadas === 1 ? '' : 'es'
            }. Comunicate con nosotros si necesitás agregar más.`
      );
      return;
    }

    if (
      !form.nombre.trim() ||
      !form.direccion.trim() ||
      !form.localidad.trim() ||
      !form.provincia.trim() ||
      !form.telefono.trim() ||
      !form.mail.trim()
    )
      return;

    setCreandoNegocio(true);
    const { data, error } = await supabase
      .from('negocios')
      .insert({
        cuenta_id: cuenta.id,
        nombre: capitalizarPalabras(form.nombre.trim()),
        direccion: form.direccion.trim(),
        localidad: capitalizarPalabras(form.localidad.trim()),
        provincia: form.provincia.trim(),
        codigo_postal: form.codigo_postal.trim() || null,
        telefono: form.telefono.trim(),
        mail: form.mail.trim(),
      })
      .select()
      .single();

    setCreandoNegocio(false);
    if (error) {
      console.error(error);
      return;
    }
    setNegocios([...negocios, data]);
    setForm(FORM_VACIO);
    setPasoAltaSucursal('inicial');
    setTextoValidacionAlta('');
  }

  function cancelarAltaSucursal() {
    setPasoAltaSucursal('inicial');
    setTextoValidacionAlta('');
    setErrorCupo(null);
  }

  function abrirEdicion(n) {
    if (editandoId === n.id) {
      setEditandoId(null);
      return;
    }
    if (
      !window.confirm(
        '¿Estás seguro que querés modificar los datos de esta sucursal? Es un dato asociado a muchas cosas.'
      )
    ) {
      return;
    }
    setEditandoId(n.id);
    setFormEdit({
      nombre: n.nombre || '',
      direccion: n.direccion || '',
      localidad: n.localidad || '',
      provincia: n.provincia || '',
      codigo_postal: n.codigo_postal || '',
      telefono: n.telefono || '',
      mail: n.mail || '',
    });
  }

  async function handleGuardarEdicion(id) {
    if (!hasAccess) {
      setMostrarSuscripcion(true);
      return;
    }

    setGuardandoEdit(true);
    const { data, error } = await supabase
      .from('negocios')
      .update({
        nombre: capitalizarPalabras(formEdit.nombre.trim()),
        direccion: formEdit.direccion.trim(),
        localidad: capitalizarPalabras(formEdit.localidad.trim()),
        provincia: formEdit.provincia.trim(),
        codigo_postal: formEdit.codigo_postal.trim() || null,
        telefono: formEdit.telefono.trim(),
        mail: formEdit.mail.trim(),
      })
      .eq('id', id)
      .select()
      .single();

    setGuardandoEdit(false);
    if (error) {
      console.error(error);
      return;
    }
    setNegocios(negocios.map((n) => (n.id === id ? data : n)));
    setEditandoId(null);
  }

  if (loading) {
    return <p className="text-center mt-24 text-[#6b6455]">Cargando...</p>;
  }

  if (!cuenta) {
    return (
      <div className="max-w-md mx-auto mt-8 px-4">
        <div className="bg-white rounded-2xl p-6 border border-[#EFDDCE]">
          <h2 className="text-lg font-bold text-[#2C2C2A] mb-2">¿Cómo se llama tu negocio?</h2>
          <form onSubmit={handleCrearCuenta} className="space-y-3">
            <input
              type="text"
              required
              value={nombreCuenta}
              onChange={(e) => setNombreCuenta(e.target.value)}
              placeholder="Nombre de tu negocio"
              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
            />
            <div>
              <label className="block text-xs font-medium text-[#6b6455] mb-1">
                ¿Cuántas sucursales tenés?
              </label>
              <input
                type="number"
                required
                min="1"
                step="1"
                value={sucursalesIniciales}
                onChange={(e) => setSucursalesIniciales(e.target.value)}
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <p className="text-xs text-[#8a8471] mt-1">
                Define el precio de tu plan. Durante la prueba gratis podés cargar 1 sucursal;
                cuando te suscribas se cobra por esta cantidad.
              </p>
            </div>
            <button
              type="submit"
              disabled={creandoCuenta}
              className="w-full py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E] disabled:opacity-60"
              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
            >
              {creandoCuenta ? 'Creando...' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const hasAccess = tieneAccesoBase(cuenta, session.user.email);
  const cupoLleno = negocios.length >= limiteSucursales(cuenta, session.user.email);
  const puedeAgregarAlPlan = cuenta.plan === 'active' && !cuenta.cancelacion_pendiente;
  const esTrialConTope = trialActivo(cuenta) && !CUENTAS_EXENTAS.includes(session.user.email);

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <PageShell>
        <TrialBanner cuenta={cuenta} />
        <EstadoBar
          icon={IconSucursalesMini}
          label="Sucursales"
          right={
            <span className="w-7 h-7 rounded-full bg-[#C1502E] text-white font-bold text-sm flex items-center justify-center">
              {negocios.length}
            </span>
          }
        />
        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <h1 className="text-2xl font-bold text-[#C1502E]">{cuenta.nombre}</h1>
        </div>

        <div className="bg-white rounded-2xl border border-[#EFDDCE] p-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-semibold text-[#2C2C2A]">Sucursales</h2>
            <span className="w-7 h-7 rounded-full bg-[#EDE0C8] text-[#C1502E] font-bold text-sm flex items-center justify-center">
              {negocios.length}
            </span>
            <span className="text-[#8a8471] font-semibold">/</span>
            <span className="w-7 h-7 rounded-full bg-[#EDE0C8] text-[#C1502E] font-bold text-sm flex items-center justify-center">
              {cuenta.sucursales_contratadas}
            </span>
          </div>

          {negocios.length === 0 && (
            <p className="text-sm text-[#6b6455] mb-4">Todavía no cargaste ninguna sucursal.</p>
          )}

          <div className="space-y-3 mb-5">
            {negocios.map((n) => (
              <div key={n.id} className="border border-[#EDE0C8] rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => abrirEdicion(n)}
                  className="w-full text-left p-4"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-[#C1502E]">{n.nombre}</p>
                    <span className="text-xs font-semibold text-white bg-[#C1502E] rounded-full px-3 py-1 flex-shrink-0 ml-2">
                      {editandoId === n.id ? 'Cerrar' : 'Editar'}
                    </span>
                  </div>
                  {n.direccion ? (
                    <>
                      <p className="text-xs font-medium text-[#3d382c]">{n.direccion}</p>
                      {(n.codigo_postal || n.localidad) && (
                        <p className="text-xs font-medium text-[#3d382c]">
                          {n.codigo_postal && `(${n.codigo_postal}) `}
                          {n.localidad}
                        </p>
                      )}
                      <p className="text-xs font-medium text-[#3d382c]">Argentina</p>
                      <p className="text-xs text-[#6b6455] mt-1">
                        {n.telefono} · {n.mail}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-[#C1502E]">Todavía no cargaste la dirección de esta sucursal.</p>
                  )}
                </button>

                {editandoId === n.id && (
                  <div className="px-4 pb-4 space-y-2 border-t border-[#EDE0C8] pt-3">
                    <CamposDireccion form={formEdit} setForm={setFormEdit} />
                    <button
                      type="button"
                      onClick={() => handleGuardarEdicion(n.id)}
                      disabled={guardandoEdit}
                      className="w-full py-2 rounded-lg font-bold tracking-wide text-white bg-[#2C2C2A] disabled:opacity-60"
                      style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                    >
                      {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {!hasAccess ? (
            <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455] flex items-center justify-between gap-3">
              <span>Necesitás una suscripción activa para cargar sucursales.</span>
              <button
                type="button"
                onClick={() => setMostrarSuscripcion(true)}
                className="text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-3 py-1 flex-shrink-0"
                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
              >
                Suscribirme
              </button>
            </div>
          ) : cupoLleno && puedeAgregarAlPlan ? (
            <AgregarSucursalPlan
              cuenta={cuenta}
              negocios={negocios}
              precioBase={precioBase}
              onAgregada={async () => {
                await cargarTodo();
                // El pago/confirmación de la sucursal nueva ya cumplió el
                // rol de "confirmá que querés agregar una sucursal": no
                // tiene sentido pedirle a la persona que confirme nuevo
                // (con otro CONFIRMAR) antes de dejarla cargar los datos.
                setPasoAltaSucursal('formulario');
              }}
            />
          ) : cupoLleno && esTrialConTope ? (
            <div className="bg-[#DCEEF7] border border-[#B8DCEC] rounded-lg p-3 text-sm text-[#1B6E8C] flex items-center justify-between gap-3">
              <span>
                Durante la prueba gratis podés cargar 1 sucursal. Suscribite para cargar
                {cuenta.sucursales_contratadas > 1
                  ? ` las ${cuenta.sucursales_contratadas} sucursales que declaraste`
                  : ' el resto'}
                .
              </span>
              <a
                href="/suscripcion"
                className="text-xs font-bold tracking-wide text-white bg-[#1B6E8C] rounded-full px-3 py-1 flex-shrink-0"
                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
              >
                Suscribirme
              </a>
            </div>
          ) : cupoLleno ? (
            <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-lg p-3 text-sm text-[#2C4A3A] font-semibold tracking-wide">
              Informaste en tu plan que tendrías {cuenta.sucursales_contratadas} sucursal
              {cuenta.sucursales_contratadas === 1 ? '' : 'es'}. Comunicate con nosotros si
              necesitás sumar más.
            </div>
          ) : pasoAltaSucursal === 'inicial' ? (
            <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-lg p-3 text-sm text-[#2C4A3A] flex items-center justify-between gap-3">
              <span className="font-semibold tracking-wide">
                Podés cargar una sucursal más cuando lo necesites.
              </span>
              <button
                type="button"
                onClick={() => setPasoAltaSucursal('confirmar')}
                className="text-xs font-bold tracking-wide text-white bg-[#C1502E] rounded-full px-3 py-1 flex-shrink-0"
                style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
              >
                Agregar sucursal
              </button>
            </div>
          ) : pasoAltaSucursal === 'confirmar' ? (
            <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455] space-y-2">
              {errorCupo && <p className="text-xs text-[#C1502E]">{errorCupo}</p>}
              <p>Agregar una sucursal nueva tiene un costo asociado a tu plan.</p>
              <p className="font-semibold text-[#2C2C2A]">
                ¿Estás seguro que querés dar de alta una sucursal más?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelarAltaSucursal}
                  className="flex-1 py-2 rounded-lg font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => setPasoAltaSucursal('validar')}
                  className="flex-1 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E]"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                >
                  Sí, continuar
                </button>
              </div>
            </div>
          ) : pasoAltaSucursal === 'validar' ? (
            <div className="bg-[#FDF6ED] border border-[#F0DFC4] rounded-lg p-3 text-sm text-[#6b6455] space-y-2">
              <p className="font-semibold text-[#2C2C2A]">
                Para confirmar, escribí CONFIRMAR
              </p>
              <input
                type="text"
                value={textoValidacionAlta}
                onChange={(e) => setTextoValidacionAlta(e.target.value)}
                placeholder="CONFIRMAR"
                className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none bg-white"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelarAltaSucursal}
                  className="flex-1 py-2 rounded-lg font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => setPasoAltaSucursal('formulario')}
                  disabled={textoValidacionAlta.trim().toUpperCase() !== 'CONFIRMAR'}
                  className="flex-1 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E] disabled:opacity-60"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                >
                  Confirmar
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCrearNegocio} className="space-y-2">
              {errorCupo && <p className="text-xs text-[#C1502E]">{errorCupo}</p>}
              <CamposDireccion form={form} setForm={setForm} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    cancelarAltaSucursal();
                    setForm(FORM_VACIO);
                  }}
                  disabled={creandoNegocio}
                  className="flex-1 py-2 rounded-lg font-bold tracking-wide text-[#2C2C2A] bg-[#EDE0C8] disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creandoNegocio}
                  className="flex-1 py-2 rounded-lg font-bold tracking-wide text-white bg-[#C1502E] disabled:opacity-60"
                  style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
                >
                  {creandoNegocio ? 'Agregando...' : 'Agregar sucursal'}
                </button>
              </div>
            </form>
          )}
        </div>
      </PageShell>

      {mostrarSuscripcion && (
        <SuscripcionRequeridaModal onClose={() => setMostrarSuscripcion(false)} />
      )}
    </div>
  );
}
