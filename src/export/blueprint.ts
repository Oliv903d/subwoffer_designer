import type { BlueprintPiece, CutBlueprint } from '../subwoofer/blueprint';
import type { Units } from '../types/cad';
import { formatLength } from '../utils/units';
import { downloadBlob, safeFileName } from './download';

export const BLUEPRINT_GUIDANCE = 'Sides are full size; top, bottom, front and back fit between them. Check bevels before cutting. Diagrams are not to scale; use the labelled dimensions. No kerf allowance is included.';

export function formatBlueprintPiece(piece: BlueprintPiece, units: Units) {
  return {
    dimensions: `${formatLength(piece.width, units)} × ${formatLength(piece.height, units)}`,
    note: piece.note?.replace(/(\d+(?:\.\d+)?) mm/g, (_, value: string) => formatLength(Number(value), units)),
  };
}

/** Vector diagrams and text on A4 pages, using the same formatting as the printable view. */
export async function downloadBlueprintPdf(blueprint: CutBlueprint, projectName: string, units: Units): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 15;
  const textWidth = 180;
  let y = margin;
  const text = (value: string, size = 11) => {
    pdf.setFontSize(size);
    const lines: string[] = pdf.splitTextToSize(value, textWidth);
    for (const line of lines) {
      if (y + 6 > 282) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += size * 0.45 + 1;
    }
  };
  text('Cut Blueprint', 20);
  text(`Project: ${projectName}`);
  text(`Design: ${blueprint.designName}`);
  text(`Material thickness: ${formatLength(blueprint.thickness, units)} | Units: ${units}`);
  text(BLUEPRINT_GUIDANCE, 10);
  y += 5;
  for (const piece of blueprint.pieces) {
    const formatted = formatBlueprintPiece(piece, units);
    pdf.setFontSize(11);
    const noteLines: string[] = formatted.note ? pdf.splitTextToSize(formatted.note, textWidth) : [];
    const needed = 52 + noteLines.length * 6;
    if (y + needed > 282) {
      pdf.addPage();
      y = margin;
      text('Cut Blueprint (continued)', 14);
    }
    text(`${piece.name} | Quantity: ${piece.qty}`, 12);
    text(formatted.dimensions);
    const points = piece.outline.map(([x, v]) => [margin + x * 65, y + v * 24]);
    pdf.setLineWidth(0.3);
    points.forEach(([x, v], i) => {
      const next = points[(i + 1) % points.length];
      pdf.line(x, v, next[0], next[1]);
    });
    y += 30;
    if (formatted.note) text(formatted.note, 11);
    y += 7;
  }
  downloadBlob(pdf.output('blob'), `${safeFileName(projectName)}_cut_blueprint.pdf`);
}
