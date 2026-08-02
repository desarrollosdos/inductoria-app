import { useState } from 'react';
import { supabase } from '../supabaseClient';

const BENEFICIOS = [
  'Armás cursos cortos con lo que ya usás para explicar (manuales, audios)',
  'Cumplís con la Ley 19.587 (seguridad e higiene) sin armar nada de cero',
  'Preparás a tu equipo para el carnet de manipulación de alimentos (Art. 21, Código Alimentario Argentino)',
  'Ves el progreso de cada empleado en un solo lugar',
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });

    setEnviando(false);

    if (error) {
      setError('No se pudo enviar el link. Probá de nuevo.');
      return;
    }
    setEnviado(true);
  }

  return (
    <div className="max-w-md mx-auto mt-12 px-4">
      <h1 className="text-lg font-bold text-[#C1502E] mb-2 whitespace-nowrap">Entrená a tu personal sin perder tiempo.</h1>
      <p className="text-lg font-bold text-[#2C2C2A] mb-1">Dejá de explicar lo mismo a cada persona nueva.</p>
      <p className="text-sm text-[#6b6455] mb-8">Entrá para armar los cursos de tu equipo.</p>

      {enviado ? (
        <div className="bg-white rounded-2xl p-6 border border-[#EFDDCE] shadow-sm text-center">
          <h2 className="text-lg font-bold text-[#2C2C2A] mb-2">Revisá tu mail</h2>
          <p className="text-sm text-[#6b6455]">Te mandamos un link para entrar a {email}.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 border border-[#EFDDCE] shadow-sm">
          <h2 className="text-lg font-bold text-[#2C2C2A] mb-1">Iniciar sesión</h2>
          <p className="text-sm text-[#6b6455] mb-4">Te mandamos un link a tu mail, sin contraseñas.</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@negocio.com"
              className="w-full border border-[#EFDDCE] rounded-lg px-3 py-2 text-sm outline-none"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={enviando}
              className="w-full py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:opacity-60"
            >
              {enviando ? 'Enviando...' : 'Enviarme el link'}
            </button>
          </form>

          <div className="border-t border-[#EFDDCE] my-5" />

          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8471] mb-3">
            Adentro podrás hacer
          </p>
          <ul className="space-y-2.5">
            {BENEFICIOS.map((texto) => (
              <li key={texto} className="flex items-start gap-2 text-sm text-[#3d382c]">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#C1502E] flex-shrink-0" />
                {texto}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
