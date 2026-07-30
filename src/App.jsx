import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Empleado from './pages/Empleado';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const path = window.location.pathname;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // La pantalla del empleado es pública, no depende de sesión de Supabase.
  if (path === '/empleado') {
    return <Empleado />;
  }

  if (loading) {
    return <p className="text-center mt-24 text-[#6b7a80]">Cargando...</p>;
  }

  return session ? <Dashboard session={session} /> : <Login />;
}
