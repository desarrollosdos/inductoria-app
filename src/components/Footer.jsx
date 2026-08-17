// Pie de página global, con los links legales. Van a inductoria.com.ar
// (la landing) porque ahí es donde viven terminos.html y
// privacidad.html — no tiene sentido duplicarlos dentro de la app.
// Se abren en pestaña nueva para no perder lo que se esté haciendo acá.
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="max-w-4xl mx-auto px-4 py-6 mt-6 text-center">
      <p className="text-[11px] text-[#8a8471]">
        © {year} Inductoria ·{' '}
        <a
          href="https://inductoria.com.ar/terminos.html"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[#6b6455]"
        >
          Términos y Condiciones
        </a>
        {' · '}
        <a
          href="https://inductoria.com.ar/privacidad.html"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[#6b6455]"
        >
          Política de Privacidad
        </a>
      </p>
    </footer>
  );
}
