// inductoria-app · src/components/Badges.jsx
// ---------------------------------------------
// Badges de curso completado, compartidos entre CursoDetalle.jsx (donde se
// otorgan) y Progreso.jsx (donde el dueño los ve por empleado). Un solo
// lugar para el diseño, así son siempre el mismo badge, solo que más chico
// en Progreso.
//
// Diseño: círculo relleno con tilde blanco. Verde para cualquier curso,
// azul para Seguridad e Higiene (mismo tamaño y forma en los dos casos,
// solo cambia el color).

export function esCursoSeguridadEHigiene(titulo) {
  const t = (titulo || '').toLowerCase();
  return t.includes('seguridad') && t.includes('higiene');
}

// Estándar de nombre de curso en toda la app: la parte hasta los ":"
// va en terracota y negrita, el resto en texto normal. Si no hay ":",
// todo el título va en terracota y negrita.
export function TituloCursoInline({ titulo, className = '', corto = false }) {
  if (!titulo) return null;
  const tieneDosPuntos = titulo.includes(':');

  if (corto) {
    const soloAntes = tieneDosPuntos ? titulo.split(':')[0] : titulo;
    return <span className={`font-semibold text-[#C1502E] ${className}`}>{soloAntes}</span>;
  }

  return (
    <span className={className}>
      {tieneDosPuntos ? (
        <>
          <span className="font-semibold text-[#C1502E]">{titulo.split(':')[0]}:</span>
          <span> {titulo.split(':').slice(1).join(':').trim()}</span>
        </>
      ) : (
        <span className="font-semibold text-[#C1502E]">{titulo}</span>
      )}
    </span>
  );
}

// Fila compacta: bullet + nombre del curso ABREVIADO (hasta los ":", sin
// incluirlos), todo en negro — sin el terracota de TituloCursoInline. Usado
// en Progreso.jsx para la lista de cursos completados por empleado.
export function CursoCompletadoFila({ titulo }) {
  const nombreCorto = titulo && titulo.includes(':') ? titulo.split(':')[0] : titulo;
  return (
    <div className="flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-[#2C2C2A] flex-shrink-0" />
      <span className="text-[13px] font-medium text-[#2C2C2A]">{nombreCorto}</span>
    </div>
  );
}

// Badge estándar: círculo verde relleno, para cualquier curso.
export function BadgeCurso({ size = 72 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="flex-shrink-0">
      <circle cx="50" cy="50" r="46" fill="#3B6D11" />
      <path
        d="M32 51 L44 63 L70 35"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Badge especial: círculo azul relleno, exclusivo para Seguridad e Higiene.
// Mismo tamaño y forma que el estándar, solo cambia el color.
export function BadgeEspecial({ size = 72 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="flex-shrink-0">
      <circle cx="50" cy="50" r="46" fill="#185FA5" />
      <path
        d="M32 51 L44 63 L70 35"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Badge chico + nombre del curso a la derecha, en fila. Usado en Progreso.jsx,
// uno por curso completado. El nombre siempre se ve (no depende de hover).
export function BadgeConTitulo({ titulo, especial, size = 24 }) {
  return (
    <div className="flex items-center gap-1.5">
      {especial ? <BadgeEspecial size={size} /> : <BadgeCurso size={size} />}
      <TituloCursoInline titulo={titulo} className="text-xs font-medium" />
    </div>
  );
}

// Escudos ilustrados para la pantalla de "Completaste" en CursoDetalle.jsx
// ÚNICAMENTE — no tocan el círculo con tilde de arriba (BadgeCurso /
// BadgeEspecial / BadgeConTitulo), que sigue igual en el resto de la app.
// Los archivos van directo en public/ (no se importan, se sirven como
// estáticos): seguridad-e-higiene.png para el curso especial, más chico;
// diploma.png para el resto de los cursos.
export function BadgeEspecialImg({ size = 64 }) {
  return (
    <img
      src="/seguridad-e-higiene.png"
      alt="Curso de Seguridad e Higiene completado"
      style={{ height: size, width: 'auto' }}
      className="flex-shrink-0"
    />
  );
}

export function BadgeCursoImg({ size = 96 }) {
  return (
    <img
      src="/diploma.png"
      alt="Curso completado"
      style={{ height: size, width: 'auto' }}
      className="flex-shrink-0"
    />
  );
}
