import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Header from './components/Header';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Empleados from './pages/Empleados';
import Contenido from './pages/Contenido';
import Progreso from './pages/Progreso';
import Suscripcion from './pages/Suscripcion';
import Empleado from './pages/Empleado';
import AdminPage from './pages/AdminPage';

const ADMIN_EMAIL = 'desarrollosdos@gmail.com';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [empleadoNombre, setEmpleadoNombre] = useState(null);

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
  // Apenas Empleado.jsx carga los datos, nos avisa el nombre para
  // mostrarlo en el header, igual que se ve el mail del dueño.
  if (path === '/empleado') {
    return (
      <>
        <Header empleadoNombre={empleadoNombre} />
        <Empleado onDatosCargados={setEmpleadoNombre} />
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

  if (!session) {
    return (
      <>
        <Header />
        <Login />
      </>
    );
  }

  if (path === '/admin') {
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
        <AdminPage session={session} />
      </>
    );
  }

  if (path === '/empleados') {
    return (
      <>
        <Header session={session} />
        <Empleados session={session} />
      </>
    );
  }

  if (path === '/contenido') {
    return (
      <>
        <Header session={session} />
        <Contenido session={session} />
      </>
    );
  }

  if (path === '/sucursales') {
    return (
      <>
        <Header session={session} />
        <Dashboard session={session} />
      </>
    );
  }

  if (path === '/progreso') {
    return (
      <>
        <Header session={session} />
        <Progreso session={session} />
      </>
    );
  }

  return (
    <>
      <Header session={session} />
      <Suscripcion session={session} />
    </>
  );
}
