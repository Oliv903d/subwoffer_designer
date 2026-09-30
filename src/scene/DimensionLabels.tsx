import { useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import type { SketchEntity, Vec2 } from '../types/cad';
import { useCad } from '../store/cadStore';
import { arcPoint, arcSweep, dist, setLineLength } from '../sketch/entities';
import { formatLength, parseLength, toDisplay } from '../utils/units';

interface LabelProps {
  at: Vec2;
  offset?: [number, number];
  prefix?: string;
  value: number;
  onCommit: (mm: number) => void;
}

/** A dimension label in the sketch; click it to type a new value (e.g. "50", "5 cm"). */
function DimensionLabel({ at, offset = [0, 0], prefix = '', value, onCommit }: LabelProps) {
  const units = useCad((s) => s.units);
  const [text, setText] = useState<string | null>(null);
  const cancelled = useRef(false);

  const commit = () => {
    if (text === null) return;
    const mm = parseLength(text, units);
    if (!cancelled.current && mm !== null && mm > 0) onCommit(mm);
    cancelled.current = false;
    setText(null);
  };

  return (
    <Html
      position={[at[0], at[1], 0]}
      zIndexRange={[30, 10]}
      style={{ transform: `translate3d(calc(-50% + ${offset[0]}px), calc(-50% + ${offset[1]}px), 0)` }}
    >
      <div>
        {text === null ? (
          <button
            className="whitespace-nowrap rounded border border-sky-400/40 bg-[#0f1a2a]/90 px-1.5 py-px font-mono text-[11px] text-sky-200 shadow hover:border-amber-400 hover:text-amber-200"
            title="Click to edit dimension"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              cancelled.current = false;
              setText(String(toDisplay(value, units)));
            }}
          >
            {prefix}
            {formatLength(value, units)}
          </button>
        ) : (
          <input
            autoFocus
            className="w-24 rounded border border-amber-400 bg-[#0f1a2a] px-1.5 py-px font-mono text-[11px] text-amber-100 outline-none"
            value={text}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                cancelled.current = true;
                setText(null);
              }
            }}
          />
        )}
      </div>
    </Html>
  );
}

function labelsFor(
  e: SketchEntity,
  update: (fn: (entities: SketchEntity[]) => SketchEntity[]) => void,
): LabelProps[] {
  const replace = (patch: Partial<SketchEntity>) =>
    update((ents) => ents.map((x) => (x.id === e.id ? ({ ...x, ...patch } as SketchEntity) : x)));

  switch (e.type) {
    case 'line':
      return [
        {
          at: [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2],
          offset: [0, -14],
          value: dist(e.a, e.b),
          onCommit: (v) => update((ents) => setLineLength(ents, e.id, v)),
        },
      ];
    case 'rect':
      return [
        { at: [e.x + e.w / 2, e.y], offset: [0, 14], value: e.w, onCommit: (w) => replace({ w }) },
        { at: [e.x + e.w, e.y + e.h / 2], offset: [34, 0], value: e.h, onCommit: (h) => replace({ h }) },
      ];
    case 'circle':
      return [
        {
          at: arcPoint(e.c, e.r, Math.PI / 4),
          offset: [30, -10],
          prefix: 'Ø ',
          value: e.r * 2,
          onCommit: (d) => replace({ r: d / 2 }),
        },
      ];
    case 'arc':
      return [
        {
          at: arcPoint(e.c, e.r, e.start + arcSweep(e) / 2),
          offset: [0, -14],
          prefix: 'R ',
          value: e.r,
          onCommit: (r) => replace({ r }),
        },
      ];
    case 'polygon':
      return [
        {
          at: arcPoint(e.c, e.r, e.angle),
          offset: [30, 0],
          prefix: 'R ',
          value: e.r,
          onCommit: (r) => replace({ r }),
        },
      ];
  }
}

export function DimensionLabels({ entities }: { entities: SketchEntity[] }) {
  const updateEntities = useCad((s) => s.updateEntities);
  const selectEntity = useCad((s) => s.selectEntity);

  return (
    <>
      {entities.flatMap((e) =>
        labelsFor(e, (fn) => {
          updateEntities(fn);
          selectEntity(e.id);
        }).map((props, i) => <DimensionLabel key={`${e.id}:${i}`} {...props} />),
      )}
    </>
  );
}
