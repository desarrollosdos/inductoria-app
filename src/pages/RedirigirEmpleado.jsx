import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// Página pública (sin sesión), igual que Empleado.jsx y Checklist.jsx.
// Existe solo para que el link que se manda por WhatsApp sea corto: en
// vez de mostrar el token entero (48 caracteres) como texto plano en el
// chat, se manda un código corto (los primeros 10 caracteres de ese
// mismo token). Acá se busca qué empleado tiene un token que empieza
// con ese código y se redirige al link real y completo (que igual pide
// el PIN antes de mostrar nada).
//
// 2026-09-24: el código se valida acá también (10 caracteres de letras,
// números, guion o guion bajo) para no llamar al servidor con cualquier
// cosa, y un error de red ya no deja la pantalla en "Redirigiendo..."
// para siempre.
const FORMATO_CODIGO = /^[A-Za-z0-9_-]{10}$/;

export default function RedirigirEmpleado() {
  const [estado, setEstado] = useState('buscando'); // buscando | invalido | error

  useEffect(() => {
    const codigo = (new URLSearchParams(window.location.search).get('c') || '').trim();
    if (!FORMATO_CODIGO.test(codigo)) {
      setEstado('invalido');
      return;
    }
    supabase.functions
      .invoke('redirigir-empleado', { method: 'POST', body: { codigo } })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setEstado('error');
          return;
        }
        if (!data?.token_acceso) {
          setEstado('invalido');
          return;
        }
        window.location.replace(`/empleado?token=${encodeURIComponent(data.token_acceso)}`);
      })
      .catch((err) => {
        console.error(err);
        setEstado('error');
      });
  }, []);

  if (estado === 'invalido') {
    return (
      <p className="text-center mt-24 text-[#6b6455] px-4">
        Este link no funciona. Pedile uno nuevo a tu encargado.
      </p>
    );
  }

  if (estado === 'error') {
    return (
      <p className="text-center mt-24 text-[#6b6455] px-4">
        No pudimos abrir tu link. Revisá tu conexión y volvé a tocarlo.
      </p>
    );
  }

  return <p className="text-center mt-24 text-[#6b6455]">Redirigiendo...</p>;
}
