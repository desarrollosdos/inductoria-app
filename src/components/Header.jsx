import { supabase } from '../supabaseClient';

const ADMIN_EMAIL = 'desarrollosdos@gmail.com';

export default function Header({ session }) {
  const isAdmin = session?.user?.email === ADMIN_EMAIL;
  const path = typeof window !== 'undefined' ? window.location.pathname : '';

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
          <div className="flex items-center gap-4">
            {isAdmin && (
              <a
                href="/admin"
                className={`text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  path === '/admin'
                    ? 'bg-[#C1502E] text-white'
                    : 'text-[#FBF3EC] hover:bg-white/10'
                }`}
              >
                Admin
              </a>
            )}
            <button
              onClick={handleLogout}
              className="text-sm font-semibold text-[#c9c5bd] hover:text-[#FBF3EC]"
            >
              Salir
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
