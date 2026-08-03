import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import DashboardNav from '../components/DashboardNav';
import EstadoBar from '../components/EstadoBar';
import PageShell from '../components/PageShell';

function IconSucursalesMini(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

const FORM_VACIO = {
  nombre: '',
  direccion: '',
  barrio: '',
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
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          required
          value={form.barrio}
          onChange={(e) => setForm({ ...form, barrio: e.target.value })}
          placeholder="Barrio"
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
      </div>
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

export default function Dashboard({ session }) {
  const [cuenta, setCuenta] = useState(null);
  const [negocios, setNegocios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nombreCuenta, setNombreCuenta] = useState('');
  const [creandoCuenta, setCreandoCuenta] = useState(false);

  const [form, setForm] = useState(FORM_VACIO);
  const [creandoNegocio, setCreandoNegocio] = useState(false);
  const [errorCupo, setErrorCupo] = useState(null);

  const [editandoId, setEditandoId] = useState(null);
  const [formEdit, setFormEdit] = useState(FORM_VACIO);
  const [guardandoEdit, setGuardandoEdit] = useState(false);

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

    setLoading(false);
  }

  async function handleCrearCuenta(e) {
    e.preventDefault();
    if (!nombreCuenta.trim()) return;
    setCreandoCuenta(true);

    const { data, error } = await supabase
      .from('cuentas')
      .insert({ owner_id: session.user.id, nombre: nombreCuenta.trim(), plan: 'inactive' })
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

    if (negocios.length >= cuenta.sucursales_contratadas) {
      setErrorCupo(
        `Informaste en tu plan que tendrías ${cuenta.sucursales_contratadas} sucursal${
          cuenta.sucursales_contratadas === 1 ? '' : 'es'
        }. Comunicate con nosotros si necesitás agregar más.`
      );
      return;
    }

    if (
      !form.nombre.trim() ||
      !form.direccion.trim() ||
      !form.barrio.trim() ||
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
        nombre: form.nombre.trim(),
        direccion: form.direccion.trim(),
        barrio: form.barrio.trim(),
        localidad: form.localidad.trim(),
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
  }

  function abrirEdicion(n) {
    if (editandoId === n.id) {
      setEditandoId(null);
      return;
    }
    setEditandoId(n.id);
    setFormEdit({
      nombre: n.nombre || '',
      direccion: n.direccion || '',
      barrio: n.barrio || '',
      localidad: n.localidad || '',
      provincia: n.provincia || '',
      codigo_postal: n.codigo_postal || '',
      telefono: n.telefono || '',
      mail: n.mail || '',
    });
  }

  async function handleGuardarEdicion(id) {
    setGuardandoEdit(true);
    const { data, error } = await supabase
      .from('negocios')
      .update({
        nombre: formEdit.nombre.trim(),
        direccion: formEdit.direccion.trim(),
        barrio: formEdit.barrio.trim(),
        localidad: formEdit.localidad.trim(),
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
            <button
              type="submit"
              disabled={creandoCuenta}
              className="w-full py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:opacity-60"
            >
              {creandoCuenta ? 'Creando...' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const cupoLleno = negocios.length >= cuenta.sucursales_contratadas;

  return (
    <div>
      <DashboardNav userEmail={session.user.email} />
      <PageShell>
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
                    <p className="text-sm font-semibold text-[#2C2C2A]">{n.nombre}</p>
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
                      className="w-full py-2 rounded-lg font-semibold text-white bg-[#2C2C2A] disabled:opacity-60"
                    >
                      {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {cupoLleno ? (
            <div className="bg-[#F3F9F5] border border-[#BFE0CE] rounded-lg p-3 text-sm text-[#2C4A3A]">
              Informaste en tu plan que tendrías {cuenta.sucursales_contratadas} sucursal
              {cuenta.sucursales_contratadas === 1 ? '' : 'es'}. Comunicate con nosotros si
              necesitás sumar más.
            </div>
          ) : (
            <form onSubmit={handleCrearNegocio} className="space-y-2">
              {errorCupo && <p className="text-xs text-[#C1502E]">{errorCupo}</p>}
              <CamposDireccion form={form} setForm={setForm} />
              <button
                type="submit"
                disabled={creandoNegocio}
                className="w-full py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:opacity-60"
              >
                {creandoNegocio ? 'Agregando...' : 'Agregar sucursal'}
              </button>
            </form>
          )}
        </div>
      </PageShell>
    </div>
  );
}
