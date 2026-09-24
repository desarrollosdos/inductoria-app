// inductoria-app · src/components/VisitTracker.jsx
// ---------------------------------------------------
// Registra una visita a la app (origen: 'app') una sola vez por sesión
// de navegador, sin bloquear ni afectar el resto de la UI.
// Se renderiza una sola vez, en App.jsx, fuera de las rutas.

import { useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function VisitTracker() {
  useEffect(() => {
    const YA_CONTADA = 'inductoria_visita_contada';

    // sessionStorage puede tirar error (modo privado de Safari viejo,
    // almacenamiento bloqueado): si pasa, contamos la visita igual y
    // seguimos, la app nunca debe romperse por esto.
    try {
      if (sessionStorage.getItem(YA_CONTADA)) return;
    } catch {
      // sin sessionStorage: se cuenta igual
    }

    Promise.resolve()
      .then(() => supabase.functions.invoke('registrar-visita', {
        body: { path: window.location.pathname, origen: 'app' },
      }))
      .catch(() => {
        // Si falla, no importa: la app nunca debe romperse por esto.
      });

    try {
      sessionStorage.setItem(YA_CONTADA, '1');
    } catch {
      // no se pudo guardar: en el peor caso se cuenta de nuevo al recargar
    }
  }, []);

  return null;
}
