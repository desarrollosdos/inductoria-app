// Envoltorio único para el contenido de cada pantalla (después del nav).
// Antes, cada pantalla definía su propio ancho, padding y espaciado por
// separado, y siempre terminaba desalineándose una de otra. Con esto,
// el espaciado se define en un solo lugar: la misma distancia que hay
// entre el menú y la barra es la misma que hay entre la barra y cada
// bloque de contenido, y entre cada bloque entre sí (gap-4 en las tres).
export default function PageShell({ children }) {
  return <div className="max-w-4xl mx-auto px-4 pb-16 mt-4 flex flex-col gap-4">{children}</div>;
}
