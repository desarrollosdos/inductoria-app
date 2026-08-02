import { useState } from 'react';
import { supabase } from '../supabaseClient';

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
    <div className="max-w-md mx-auto mt-16 px-4">
      {enviado ? (
        <div className="bg-white rounded-2xl p-6 border border-[#EFDDCE] shadow-sm text-center">
          <h2 className="text-lg font-bold text-[#2C2C2A] mb-2">Revisá tu mail</h2>
          <p className="text-sm text-[#6b6455]">Te mandamos un link para entrar a {email}.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 border border-[#EFDDCE] shadow-sm">
          <ul className="space-y-2 mb-6">
            {[
              'Subís lo que ya usás para capacitar y armamos cursos cortos',
              'Tu equipo aprende solo, sin que repitas todo de nuevo',
              'Cumplís con la Ley 19.587 con un curso ya armado',
              'Seguís el progreso de cada empleado en un solo lugar',
            ].map((texto) => (
              <li key={texto} className="flex items-start gap-2 text-sm text-[#3d382c]">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#C1502E] flex-shrink-0" />
                {texto}
              </li>
            ))}
          </ul>
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
        </div>
      )}
    </div>
  );
}
