import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

function IconPersona(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

// Chip redondo con ícono de persona (antes la inicial del mail), solo visible en mobile (en
// desktop el mail ya se ve entero al lado del botón de salir, así que
// esto sobraría ahí). En mobile no entra el mail completo al lado del
// botón, así que en vez de ocultarlo sin más, este chip lo deja a un
// toque de distancia: lo tocás y aparece el mail completo abajo, en un
// globito, hasta que lo volvés a tocar o tocás en cualquier otro lado.
function ChipEmailMobile({ email }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    function handleClickAfuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', handleClickAfuera);
    document.addEventListener('touchstart', handleClickAfuera);
    return () => {
      document.removeEventListener('mousedown', handleClickAfuera);
      document.removeEventListener('touchstart', handleClickAfuera);
    };
  }, [abierto]);

  return (
    <div className="relative sm:hidden" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title="Ver cuenta"
        aria-label="Ver cuenta"
        className="w-8 h-8 rounded-full bg-[#7C8B6F] text-white flex items-center justify-center"
      >
        <IconPersona />
      </button>
      {abierto && (
        <div className="absolute right-0 top-11 z-50 bg-white border border-[#EFDDCE] rounded-xl shadow-lg px-3 py-2 whitespace-nowrap">
          <p className="text-xs font-semibold text-[#2C2C2A]">{email}</p>
        </div>
      )}
    </div>
  );
}

export default function Header({ session, empleadoNombre }) {
  async function handleLogout() {
    if (!window.confirm('¿Seguro que querés salir?')) return;
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <header className="bg-[#2C2C2A]">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-3">
          <svg width="44" height="44" viewBox="0 0 120 120" aria-hidden="true">
            <rect x="15" y="10" width="90" height="100" rx="14" fill="#FBF3EC" transform="rotate(-3 60 60)" />
            <circle cx="60" cy="33" r="14" fill="#C1502E" transform="rotate(-3 60 60)" />
            <rect x="40" y="57" width="40" height="6" rx="3" fill="#C1502E" transform="rotate(-3 60 60)" />
            <rect x="40" y="70" width="40" height="6" rx="3" fill="#8a8a86" transform="rotate(-3 60 60)" />
          </svg>
          <span
            style={{ fontFamily: "'Fredoka', sans-serif", fontWeight: 600 }}
            className="text-2xl text-[#FBF3EC]"
          >
            inductoria
          </span>
        </a>

        {session && (
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden sm:inline text-xs font-semibold text-[#FBF3EC]">{session.user.email}</span>
            <ChipEmailMobile email={session.user.email} />
            <button
              onClick={handleLogout}
              title="Salir"
              className="h-9 px-4 rounded-full bg-[#C1502E] text-white text-xs font-bold tracking-wide flex items-center justify-center hover:opacity-90 transition-opacity"
              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.35)' }}
            >
              Salir
            </button>
          </div>
        )}

        {/* El empleado no tiene sesión de Supabase (entra por token), así
            que solo le mostramos su nombre, sin botón de salir. */}
        {empleadoNombre && (
          <span className="text-sm font-semibold text-[#FBF3EC]">{empleadoNombre}</span>
        )}
      </div>
    </header>
  );
}
