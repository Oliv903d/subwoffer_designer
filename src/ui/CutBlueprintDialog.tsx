import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, X } from 'lucide-react';
import { useCad } from '../store/cadStore';
import type { EnclosureObject } from '../types/cad';
import { deriveCutBlueprint } from '../subwoofer/blueprint';
import { BLUEPRINT_GUIDANCE, downloadBlueprintPdf, formatBlueprintPiece } from '../export/blueprint';
import { formatLength } from '../utils/units';
import { ToolButton } from './controls';

export function CutBlueprintDialog({ box, onClose }: { box: EnclosureObject; onClose: () => void }) {
  const units = useCad((s) => s.units);
  const projectName = useCad((s) => s.projectName);
  const result = deriveCutBlueprint(box);
  const [exportError, setExportError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (buttons?.length) {
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previousFocus?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="blueprint-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="blueprint-dialog" role="dialog" aria-modal="true" aria-labelledby="blueprint-title" tabIndex={-1} ref={dialog}>
        <div className="blueprint-actions">
          <ToolButton icon={Printer} label="Print" disabled={!result.blueprint} onClick={() => window.print()} />
          <ToolButton
            icon={Download}
            label={downloading ? 'Generating PDF…' : 'Download PDF'}
            disabled={!result.blueprint || downloading}
            onClick={async () => {
              if (!result.blueprint) return;
              setDownloading(true);
              setExportError('');
              try {
                await downloadBlueprintPdf(result.blueprint, projectName, units);
              } catch {
                setExportError('Could not generate the PDF. Please try again, or use Print.');
              } finally {
                setDownloading(false);
              }
            }}
          />
          <ToolButton icon={X} label="Close" onClick={onClose} />
        </div>
        <article className="blueprint-sheet">
          <h1 id="blueprint-title">Cut Blueprint</h1>
          {!result.blueprint ? <p role="alert">{result.error}</p> : (
            <>
              <p><b>Project:</b> {projectName}</p>
              <p><b>Design:</b> {result.blueprint.designName}</p>
              <p><b>Material thickness:</b> {formatLength(result.blueprint.thickness, units)} · <b>Units:</b> {units}</p>
              <p className="blueprint-guidance">{BLUEPRINT_GUIDANCE}</p>
              <div className="blueprint-pieces">
                {result.blueprint.pieces.map((piece) => {
                  const formatted = formatBlueprintPiece(piece, units);
                  return (
                    <section className="blueprint-piece" key={piece.name}>
                      <h2>{piece.name} <span>Quantity: {piece.qty}</span></h2>
                      <svg viewBox="0 0 260 120" role="img" aria-label={`${piece.name}: ${formatted.dimensions}`}>
                        <polygon points={piece.outline.map(([x, y]) => `${30 + x * 200},${10 + y * 95}`).join(' ')} />
                      </svg>
                      <p className="blueprint-dimensions">{formatted.dimensions}</p>
                      {formatted.note && <p>{formatted.note}</p>}
                    </section>
                  );
                })}
              </div>
            </>
          )}
          {exportError && <p className="blueprint-export-error" role="alert">{exportError}</p>}
        </article>
      </div>
    </div>,
    document.body,
  );
}
