import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// Página pública (sin sesión), igual que Empleado.jsx y Checklist.jsx.
// Existe solo para que el link que se manda por WhatsApp sea corto: en
// vez de mostrar el token entero (48 caracteres) como texto plano en el
// chat, se manda un código corto (los primeros 10 caracteres de ese
// mismo token). Acá se busca qué empleado tiene un token que empieza
// con ese código y se redirige al link real y completo.
export default function RedirigirEmpleado() {
  const [estado, setEstado] = useState('buscando'); // buscando | error

  useEffect(() => {
    const codigo = new URLSearchParams(window.location.search).get('c');
    if (!codigo) {
      setEstado('error');
      return;
    }
    supabase.functions
      .invoke('redirigir-empleado', { method: 'POST', body: { codigo } })
      .then(({ data, error }) => {
        if (error || !data?.token_acceso) {
          setEstado('error');
          return;
        }
        window.location.replace(`/empleado?token=${data.token_acceso}`);
      });
  }, []);

  if (estado === 'error') {
    return (
      <p className="text-center mt-24 text-[#6b6455] px-4">
        Este link no es válido. Pedile a tu empleador que te lo vuelva a enviar.
      </p>
    );
  }

  return <p className="text-center mt-24 text-[#6b6455]">Redirigiendo...</p>;
}
