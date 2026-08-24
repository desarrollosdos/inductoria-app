import { supabase } from '../supabaseClient';

// Mismo verde salvia (#7C8B6F) que ya se usa en el resto de la app (tab
// Admin de DashboardNav, podio de Progreso, etc.) — antes iba una inicial
// del mail acá, ahora un ícono de persona.
function IconPersona(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
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
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs font-semibold text-[#FBF3EC]">{session.user.email}</span>
            <span
              title={session.user.email}
              className="w-9 h-9 rounded-full bg-[#7C8B6F] text-white flex items-center justify-center flex-shrink-0"
            >
              <IconPersona />
            </span>
            <button
              onClick={handleLogout}
              title="Salir"
              className="h-9 px-4 rounded-full bg-[#C1502E] text-white text-xs font-semibold flex items-center justify-center hover:opacity-90 transition-opacity"
            >
              Salida
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
