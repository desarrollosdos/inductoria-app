import jsPDF from 'jspdf';

// Certificado de finalización, compartido entre CursoDetalle.jsx (lo
// descarga el empleado al terminar) y Progreso.jsx (lo puede descargar
// el dueño para cualquier curso ya completado). Un solo diseño, un solo
// lugar para ajustarlo.
export function generarCertificadoPDF({ nombreEmpleado, negocioNombre, tituloCurso, puntaje, fechaCompletado }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  const TERRACOTA = [193, 80, 46];
  const NAVY = [27, 42, 61];
  const CREMA = [242, 240, 234];
  const TEXTO = [44, 44, 42];
  const MUTED = [120, 113, 97]; // más oscuro que el gris original, legible sobre crema

  // Fondo
  doc.setFillColor(...CREMA);
  doc.rect(0, 0, w, h, 'F');

  // Borde único, con margen generoso para que nada choque contra él
  doc.setDrawColor(...TERRACOTA);
  doc.setLineWidth(0.8);
  doc.rect(8, 8, w - 16, h - 16);

  const centroX = w / 2;

  // Marca "INDUCTORIA" arriba, como wordmark
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const WORDMARK = 'INDUCTORIA';
  const LETTER_SPACING = 1.5;
  doc.text(WORDMARK, centroX, 20, { align: 'center', charSpace: LETTER_SPACING });

  // Línea fina terracota debajo, con el mismo ancho que el texto de
  // arriba (ancho real de la fuente + el espaciado entre letras que le
  // agregamos, si no queda más corta que el wordmark).
  const anchoWordmark = doc.getTextWidth(WORDMARK) + LETTER_SPACING * (WORDMARK.length - 1);
  doc.setDrawColor(...TERRACOTA);
  doc.setLineWidth(0.4);
  doc.line(centroX - anchoWordmark / 2, 24, centroX + anchoWordmark / 2, 24);

  // Eyebrow
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('CERTIFICADO DE FINALIZACIÓN', centroX, 34, { align: 'center', charSpace: 0.6 });

  // Nombre del empleado
  doc.setTextColor(...TEXTO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text(nombreEmpleado, centroX, 50, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text('completó satisfactoriamente el curso', centroX, 59, { align: 'center' });

  // Título del curso completo (no solo la mitad después de los ":"),
  // con salto de línea automático si no entra en el ancho disponible.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(...TERRACOTA);
  const anchoMaximo = w - 44;
  const lineasTitulo = doc.splitTextToSize(tituloCurso, anchoMaximo);
  let y = 71;
  lineasTitulo.forEach((linea) => {
    doc.text(linea, centroX, y, { align: 'center' });
    y += 7;
  });

  // Puntaje, debajo del título (posición dinámica según cuántas líneas ocupó)
  y += 4;
  if (puntaje != null) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...TEXTO);
    doc.text(`Puntaje obtenido: ${puntaje}%`, centroX, y, { align: 'center' });
  }

  // Línea separadora antes del pie
  doc.setDrawColor(...TERRACOTA);
  doc.setLineWidth(0.3);
  doc.line(centroX - 22, h - 26, centroX + 22, h - 26);

  const fecha = fechaCompletado
    ? new Date(fechaCompletado).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...TEXTO);
  doc.text(negocioNombre ? `${negocioNombre} · ${fecha}` : fecha, centroX, h - 19, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Generado con Inductoria', centroX, h - 13, { align: 'center' });

  const nombreArchivo = `Certificado - ${nombreEmpleado} - ${tituloCurso}.pdf`.replace(/[\\/:*?"<>|]/g, '');
  doc.save(nombreArchivo);
}
