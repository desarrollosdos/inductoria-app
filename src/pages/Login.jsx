import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { esCuentaDemo } from '../lib/acceso';

const BENEFICIOS = [
  'Armás cursos cortos con lo que ya usás para explicar (manuales, audios)',
  'Tenés listo el curso de seguridad e higiene (Ley 19.587)',
  'Tenés listo el curso de manipulación de alimentos (Código Alimentario Argentino, Art. 21)',
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

    // Cuenta de demostración: entra directo, sin mandar link. La función
    // demo-login devuelve un código de un solo uso y con eso se abre la
    // sesión acá mismo (App.jsx la detecta sola y muestra el panel).
    if (esCuentaDemo(email)) {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/demo-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.token_hash) throw new Error(json.error || 'demo');
        const { error: errDemo } = await supabase.auth.verifyOtp({
          token_hash: json.token_hash,
          type: 'magiclink',
        });
        if (errDemo) throw errDemo;
      } catch (err) {
        console.error(err);
        setError('No pudimos abrir la cuenta de demostración. Probá de nuevo en un rato.');
      }
      setEnviando(false);
      return;
    }

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
      <h1 className="text-lg font-bold text-[#C1502E] mb-2">Capacitá a tu equipo sin perder tiempo.</h1>
      <p className="text-lg font-bold text-[#2C2C2A] mb-1">Dejá de explicar lo mismo a cada persona nueva.</p>
      <p className="text-sm text-[#6b6455] mb-8">Entrá para armar los cursos de tu equipo.</p>

      {enviado ? (
        <div className="bg-white rounded-2xl p-6 border border-[#EFDDCE] shadow-sm text-center">
          <h2 className="text-lg font-bold text-[#2C2C2A] mb-2">Revisá tu mail</h2>
          <p className="text-sm text-[#6b6455]">Te mandamos un link para entrar a {email}.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 border border-[#EFDDCE] shadow-sm">
          <h2 className="text-lg font-bold text-[#2C2C2A] mb-1">Entrar</h2>
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
            {error && <p className="text-xs font-semibold text-[#C1502E]">{error}</p>}
            <button
              type="submit"
              disabled={enviando}
              className="w-full py-2 rounded-lg font-semibold text-white bg-[#C1502E] disabled:opacity-60"
            >
              {enviando ? 'Enviando...' : 'Enviarme el link'}
            </button>
          </form>

          <div className="border-t border-[#EFDDCE] my-5" />

          <p className="text-xs font-semibold tracking-wide text-[#8a8471] mb-3">Adentro vas a poder:</p>
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
