import jsPDF from 'jspdf';

// PDF de un Procedimiento (SOP), pensado para imprimir o mandar por
// WhatsApp: objetivo, alcance, qué necesitás a mano, pasos numerados, y
// qué hacer ante excepciones. Mismo criterio de marca que certificado.js
// (misma paleta, mismo helper de texto centrado con espaciado), pero acá
// el documento puede ocupar varias páginas, así que suma manejo de
// salto de página y numeración en el pie.
//
// A propósito NO incluye un flowchart/diagrama de flujo en esta primera
// versión — se probó un mockup y quedó poco prolijo, así que se dejó
// afuera por ahora. Si más adelante se arma uno mejor, se agrega acá.

const TERRACOTA = [193, 80, 46];
const NAVY = [27, 42, 61];
const CREMA = [242, 240, 234];
const TEXTO = [44, 44, 42];
const MUTED = [120, 113, 97];

const MARGEN = 18;

export function generarProcedimientoPDF({ negocioNombre, procedimiento }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const anchoUtil = w - MARGEN * 2;
  const yMax = h - 22; // deja lugar para el pie de página

  let y = 0;

  function textoCentradoConEspaciado(texto, yPos, charSpace) {
    const anchoBase = doc.getTextWidth(texto);
    const anchoTotal = anchoBase + charSpace * texto.length;
    doc.text(texto, w / 2 - anchoTotal / 2, yPos, { charSpace });
    return anchoTotal;
  }

  // Encabezado de marca, se repite arriba de cada página.
  function dibujarHeader() {
    doc.setFillColor(...CREMA);
    doc.rect(0, 0, w, 16, 'F');
    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    textoCentradoConEspaciado('INDUCTORIA', 10, 1.2);
    doc.setDrawColor(...TERRACOTA);
    doc.setLineWidth(0.5);
    doc.line(MARGEN, 16, w - MARGEN, 16);
    y = 26;
  }

  function nuevaPagina() {
    doc.addPage();
    dibujarHeader();
  }

  // Chequea si lo que sigue entra en lo que queda de página; si no,
  // saltamos de página antes de dibujarlo.
  function asegurarEspacio(alturaNecesaria) {
    if (y + alturaNecesaria > yMax) nuevaPagina();
  }

  function tituloSeccion(texto) {
    asegurarEspacio(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...TERRACOTA);
    doc.text(texto, MARGEN, y);
    y += 5.5;
    doc.setDrawColor(...TERRACOTA);
    doc.setLineWidth(0.3);
    doc.line(MARGEN, y - 3.2, MARGEN + 14, y - 3.2);
    y += 1.5;
  }

  function parrafo(texto, opts = {}) {
    if (!texto) return;
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size || 10);
    doc.setTextColor(...(opts.color || TEXTO));
    const lineas = doc.splitTextToSize(texto, anchoUtil - (opts.sangria || 0));
    const alturaLinea = opts.alturaLinea || 5;
    lineas.forEach((linea) => {
      asegurarEspacio(alturaLinea);
      doc.text(linea, MARGEN + (opts.sangria || 0), y);
      y += alturaLinea;
    });
  }

  function itemConBullet(texto, bulletTexto = '•') {
    const sangria = 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...TEXTO);
    const lineas = doc.splitTextToSize(texto, anchoUtil - sangria);
    asegurarEspacio(lineas.length * 5);
    doc.setTextColor(...TERRACOTA);
    doc.setFont('helvetica', 'bold');
    doc.text(bulletTexto, MARGEN, y);
    doc.setTextColor(...TEXTO);
    doc.setFont('helvetica', 'normal');
    lineas.forEach((linea, i) => {
      doc.text(linea, MARGEN + sangria, y + i * 5);
    });
    y += lineas.length * 5;
  }

  // ---------- Página 1 ----------
  dibujarHeader();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  y += 0;
  doc.text('PROCEDIMIENTO', MARGEN, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...TEXTO);
  const lineasTitulo = doc.splitTextToSize(procedimiento.titulo || 'Sin título', anchoUtil);
  lineasTitulo.forEach((linea) => {
    doc.text(linea, MARGEN, y);
    y += 7.5;
  });
  y += 1;

  // Tabla de metadatos: negocio, área, versión, responsable — como una
  // grilla simple de 2 columnas dibujada a mano (sin autotable).
  const metadatos = [
    ['Negocio', negocioNombre || '-'],
    ['Área', procedimiento.area || '-'],
    ['Versión', String(procedimiento.version || 1)],
    ['Responsable', procedimiento.responsable || 'A definir'],
  ];
  const colEtiquetaW = 32;
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.15);
  const altoFila = 7.5;
  const tablaAltoTotal = altoFila * metadatos.length;
  asegurarEspacio(tablaAltoTotal + 4);
  const yTablaInicio = y + 2;
  metadatos.forEach((fila, i) => {
    const filaY = yTablaInicio + i * altoFila;
    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 246 : 255, i % 2 === 0 ? 240 : 255);
    doc.rect(MARGEN, filaY, anchoUtil, altoFila, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(fila[0].toUpperCase(), MARGEN + 2, filaY + altoFila / 2 + 1.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXTO);
    doc.text(String(fila[1]), MARGEN + colEtiquetaW, filaY + altoFila / 2 + 1.2);
  });
  doc.setDrawColor(...TERRACOTA);
  doc.setLineWidth(0.3);
  doc.rect(MARGEN, yTablaInicio, anchoUtil, tablaAltoTotal);
  y = yTablaInicio + tablaAltoTotal + 8;

  // Objetivo
  tituloSeccion('Objetivo');
  parrafo(procedimiento.objetivo || 'No especificado.');
  y += 4;

  // Alcance
  tituloSeccion('Alcance');
  parrafo(procedimiento.alcance || 'No especificado.');
  y += 4;

  // Materiales
  const materiales = Array.isArray(procedimiento.materiales) ? procedimiento.materiales : [];
  if (materiales.length > 0) {
    tituloSeccion('Qué necesitás a mano');
    materiales.forEach((m) => itemConBullet(m));
    y += 4;
  }

  // Pasos
  const pasos = Array.isArray(procedimiento.pasos) ? procedimiento.pasos : [];
  if (pasos.length > 0) {
    tituloSeccion('Pasos');
    pasos.forEach((p, i) => {
      const numero = `${i + 1}.`;
      const sangria = 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const lineas = doc.splitTextToSize(p, anchoUtil - sangria);
      asegurarEspacio(lineas.length * 5.5 + 1.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TERRACOTA);
      doc.text(numero, MARGEN, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...TEXTO);
      lineas.forEach((linea, j) => {
        doc.text(linea, MARGEN + sangria, y + j * 5.5);
      });
      y += lineas.length * 5.5 + 1.5;
    });
    y += 3;
  }

  // Excepciones
  const excepciones = Array.isArray(procedimiento.excepciones) ? procedimiento.excepciones : [];
  if (excepciones.length > 0) {
    tituloSeccion('Qué hacer si algo sale mal');
    excepciones.forEach((exc) => {
      asegurarEspacio(6);
      parrafo(`Si ${exc.condicion}:`, { bold: true, size: 9.8 });
      parrafo(exc.accion, { sangria: 4 });
      y += 2.5;
    });
  }

  // ---------- Pie de página, en todas las páginas ----------
  const totalPaginas = doc.internal.getNumberOfPages();
  const fecha = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.1);
    doc.line(MARGEN, h - 15, w - MARGEN, h - 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(negocioNombre ? `${negocioNombre} · ${fecha}` : fecha, MARGEN, h - 10);
    doc.text(`Página ${i} de ${totalPaginas}`, w - MARGEN, h - 10, { align: 'right' });
    textoCentradoConEspaciado('Generado con Inductoria', h - 10, 0.3);
  }

  const nombreArchivo = `Procedimiento - ${procedimiento.titulo || 'sin titulo'}.pdf`.replace(/[\\/:*?"<>|]/g, '');
  doc.save(nombreArchivo);
}
