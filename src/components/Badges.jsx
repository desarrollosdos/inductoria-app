// inductoria-app · src/components/Badges.jsx
// ---------------------------------------------
// Badges de curso completado, compartidos entre CursoDetalle.jsx (donde se
// otorgan) y Progreso.jsx (donde el dueño los ve por empleado). Un solo
// lugar para el diseño, así son siempre el mismo badge, solo que más chico
// en Progreso.

export function esCursoSeguridadEHigiene(titulo) {
  const t = (titulo || '').toLowerCase();
  return t.includes('seguridad') && t.includes('higiene');
}

// Badge estándar: círculo terracota, para cualquier curso.
export function BadgeCurso({ size = 72 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="flex-shrink-0">
      <circle cx="50" cy="50" r="44" fill="#FBEAE3" stroke="#C1502E" strokeWidth="4" />
      <path
        d="M32 51 L44 63 L70 35"
        fill="none"
        stroke="#C1502E"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Badge especial: medalla dorada con cinta, exclusiva para Seguridad e Higiene.
// conTexto=false omite el texto de adentro (para versiones chicas donde no
// entraría legible, como en Progreso).
export function BadgeEspecial({ size = 110, conTexto = true }) {
  return (
    <svg viewBox="0 0 100 150" width={size} height={size * 1.5} className="flex-shrink-0">
      <defs>
        <linearGradient id="oroMedalla" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FCE9A8" />
          <stop offset="50%" stopColor="#F0C349" />
          <stop offset="100%" stopColor="#D89B2A" />
        </linearGradient>
      </defs>

      {/* Cintas */}
      <path d="M38 62 L38 130 L47 118 L53 132 L53 62 Z" fill="#C1502E" />
      <path d="M62 62 L62 130 L53 118 L47 132 L47 62 Z" fill="#A5401F" />

      {/* Borde dentado */}
      <path
        d="M 50.0,4.0 L 55.5,11.4 L 63.0,6.1 L 65.9,14.8 L 74.7,12.0 L 74.7,21.3 L 84.0,21.3 L 81.2,30.1 L 89.9,33.0 L 84.6,40.5 L 92.0,46.0 L 84.6,51.5 L 89.9,59.0 L 81.2,61.9 L 84.0,70.7 L 74.7,70.7 L 74.7,80.0 L 65.9,77.2 L 63.0,85.9 L 55.5,80.6 L 50.0,88.0 L 44.5,80.6 L 37.0,85.9 L 34.1,77.2 L 25.3,80.0 L 25.3,70.7 L 16.0,70.7 L 18.8,61.9 L 10.1,59.0 L 15.4,51.5 L 8.0,46.0 L 15.4,40.5 L 10.1,33.0 L 18.8,30.1 L 16.0,21.3 L 25.3,21.3 L 25.3,12.0 L 34.1,14.8 L 37.0,6.1 L 44.5,11.4 Z"
        fill="url(#oroMedalla)"
        stroke="#C1502E"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Círculo interior */}
      <circle cx="50" cy="46" r="30" fill="url(#oroMedalla)" stroke="#C1502E" strokeWidth="2.5" />
      <circle cx="50" cy="46" r="25" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1" />

      {/* Texto adentro (solo en la versión grande) */}
      {conTexto && (
        <>
          <text x="50" y="43" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#7A3A1D" fontFamily="Arial, sans-serif">
            SEGURIDAD
          </text>
          <text x="50" y="53" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#7A3A1D" fontFamily="Arial, sans-serif">
            E HIGIENE
          </text>
        </>
      )}
    </svg>
  );
}

// Badge chico + nombre del curso a la derecha, en fila. Usado en Progreso.jsx,
// uno por curso completado. El nombre siempre se ve (no depende de hover).
export function BadgeConTitulo({ titulo, especial, size = 24 }) {
  return (
    <div className="flex items-center gap-1.5">
      {especial ? (
        <BadgeEspecial size={size * 0.73} conTexto={false} />
      ) : (
        <BadgeCurso size={size} />
      )}
      <p className="text-xs text-[#3d382c] font-medium">{titulo}</p>
    </div>
  );
}
