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
export function TituloCursoInline({ titulo, className = '' }) {
  if (!titulo) return null;
  const tieneDosPuntos = titulo.includes(':');
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

// Fila compacta: tilde de color (sin círculo de fondo) + nombre del curso.
// Usado en Progreso.jsx para la lista de cursos completados por empleado.
export function CursoCompletadoFila({ titulo, especial }) {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={especial ? '#185FA5' : '#3B6D11'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <path d="M4 12.5 L9.5 18 L20 6" />
      </svg>
      <TituloCursoInline titulo={titulo} className="text-[13px]" />
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
