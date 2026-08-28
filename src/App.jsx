import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Header from './components/Header';
import Footer from './components/Footer';
import VisitTracker from './components/VisitTracker';
import InstalarAppPrompt from './components/InstalarAppPrompt';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Empleados from './pages/Empleados';
import Contenido from './pages/Contenido';
import Procedimientos from './pages/Procedimientos';
import Progreso from './pages/Progreso';
import Checklists from './pages/Checklists';
import Suscripcion from './pages/Suscripcion';
import Empleado from './pages/Empleado';
import CursoDetalle from './pages/CursoDetalle';
import Checklist from './pages/Checklist';
import AdminPage from './pages/AdminPage';
import Ayuda from './pages/Ayuda';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [empleadoNombre, setEmpleadoNombre] = useState(null);

  // Antes esto se decidía comparando el mail contra un string fijo
  // (ADMIN_EMAIL) acá mismo y de nuevo en DashboardNav.jsx. Ahora la
  // lista de administradores vive en la base (tabla `administradores`),
  // así que se puede agregar gente sin tocar código ni volver a
  // desplegar. es_administrador() es una función de Supabase (RPC) que
  // devuelve true/false según si el mail logueado está en esa tabla.
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

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

  useEffect(() => {
    // Sin sesión no hay nada que consultar: nos ahorramos el pedido a
    // Supabase y directamente asumimos que no es admin.
    if (!session) {
      setIsAdmin(false);
      setCheckingAdmin(false);
      return;
    }
    setCheckingAdmin(true);
    supabase.rpc('es_administrador').then(({ data, error }) => {
      setIsAdmin(!error && data === true);
      setCheckingAdmin(false);
    });
  }, [session]);

  function renderContenido() {
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

    if (path === '/curso') {
      return (
        <>
          <Header empleadoNombre={empleadoNombre} />
          <CursoDetalle />
        </>
      );
    }

    // Pantalla nueva del empleado para ver y marcar el checklist operativo
    // de su sucursal. Pública igual que /empleado y /curso: usa el mismo
    // token de acceso, no depende de sesión de Supabase.
    if (path === '/checklist') {
      return (
        <>
          <Header empleadoNombre={empleadoNombre} />
          <Checklist />
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

    if (checkingAdmin) {
      return (
        <>
          <Header session={session} />
          <p className="text-center mt-24 text-[#6b6455]">Cargando...</p>
        </>
      );
    }

    // Un administrador solo ve la sección de administración: no le
    // interesa el resto de la app (sucursales, empleados, contenido,
    // etc.), así que sea cual sea la ruta se le muestra siempre
    // AdminPage. Esto reemplaza al viejo chequeo "solo si path === '/admin'".
    if (isAdmin) {
      return (
        <>
          <Header session={session} />
          <AdminPage session={session} />
        </>
      );
    }

    if (path === '/admin') {
      return (
        <>
          <Header session={session} />
          <p className="text-center mt-24 text-[#6b6455]">No tenés acceso a esta sección.</p>
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

    if (path === '/procedimientos') {
      return (
        <>
          <Header session={session} />
          <Procedimientos session={session} />
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

    if (path === '/checklists') {
      return (
        <>
          <Header session={session} />
          <Checklists session={session} />
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

    if (path === '/ayuda') {
      return (
        <>
          <Header session={session} />
          <Ayuda session={session} />
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

  return (
    // min-h-screen + flex-col acá, y flex-1 en el contenido de abajo: es
    // el patrón estándar de "footer pegado abajo". Antes el Footer
    // quedaba pegado al final del contenido nomás, así que en pantallas
    // con poco contenido (por ejemplo, "Cargando..." o una lista vacía)
    // aparecía a mitad de página en vez de al pie. Con esto, si el
    // contenido es corto, el espacio vacío que sobra lo absorbe el div
    // de en medio (flex-1) y el Footer siempre queda al fondo de la
    // pantalla; si el contenido es largo, el Footer baja con él, después
    // de todo lo demás, como corresponde.
    <div className="min-h-screen flex flex-col">
      <VisitTracker />
      <div className="flex-1 flex flex-col">{renderContenido()}</div>
      <Footer />
      {/* Solo para el dueño logueado (no en /empleado, /curso ni /checklist,
          que son públicas): ofrece instalar Inductoria como app de escritorio. */}
      {session && path !== '/empleado' && path !== '/curso' && path !== '/checklist' && <InstalarAppPrompt />}
    </div>
  );
}
