import { supabase } from '../supabaseClient';

function IconSalir(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function Header({ session }) {
  async function handleLogout() {
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
            <span className="hidden sm:inline text-sm text-[#c9c5bd]">{session.user.email}</span>
            <button
              onClick={handleLogout}
              title="Salir"
              className="w-9 h-9 rounded-full bg-[#C1502E] text-white flex items-center justify-center hover:opacity-90 transition-opacity"
            >
              <IconSalir />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
