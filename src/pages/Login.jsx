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

  if (enviado) {
    return (
      <div className="max-w-md mx-auto mt-24 px-4 text-center">
        <h2 className="text-lg font-bold text-[#2C2C2A] mb-2">Revisá tu mail</h2>
        <p className="text-sm text-[#6b6455]">Te mandamos un link para entrar a {email}.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-24 px-4">
      <div className="bg-white rounded-2xl p-6 border border-[#EFDDCE]">
        <h1 className="text-xl font-bold text-[#2C2C2A] mb-1">Inductoria</h1>
        <p className="text-sm text-[#6b6455] mb-4">Entrá con tu mail, sin contraseña.</p>
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
    </div>
  );
}
