import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Header from './components/Header';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Empleado from './pages/Empleado';
import AdminPage from './pages/AdminPage';

const ADMIN_EMAIL = 'desarrollosdos@gmail.com';

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
    return (
      <>
        <Header />
        <Empleado />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Header />
        <p className="text-center mt-24 text-[#6b6455]">Cargando...</p>
      </>
    );
  }

  if (path === '/admin') {
    if (!session) {
      return (
        <>
          <Header />
          <Login />
        </>
      );
    }
    if (session.user.email !== ADMIN_EMAIL) {
      return (
        <>
          <Header session={session} />
          <p className="text-center mt-24 text-[#6b6455]">No tenés acceso a esta sección.</p>
        </>
      );
    }
    return (
      <>
        <Header session={session} />
        <AdminPage />
      </>
    );
  }

  return (
    <>
      <Header session={session} />
      {session ? <Dashboard session={session} /> : <Login />}
    </>
  );
}
