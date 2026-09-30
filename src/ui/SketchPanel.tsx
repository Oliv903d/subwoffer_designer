import { ArrowUpFromLine, Check, Trash2 } from 'lucide-react';
import { useActiveSketch, useCad } from '../store/cadStore';
import type { SketchEntity, Vec2 } from '../types/cad';
import { ENTITY_LABEL, dist, moveLinePoint, setLineLength } from '../sketch/entities';
import { hasClosedProfile } from '../sketch/profiles';
import { round } from '../utils/units';
import { NumberField, Section, ToolButton } from './controls';
import { SKETCH_TOOL_ICONS } from './icons';

const DEG = 180 / Math.PI;

function EntityEditor({ entity }: { entity: SketchEntity }) {
  const updateEntities = useCad((s) => s.updateEntities);
  const deleteEntity = useCad((s) => s.deleteEntity);
  const key = (field: string) => `${entity.id}:${field}`;

  const patch = (field: string, p: Partial<SketchEntity>) =>
    updateEntities((ents) => ents.map((e) => (e.id === entity.id ? ({ ...e, ...p } as SketchEntity) : e)), key(field));

  const point = (label: string, p: Vec2, onChange: (p: Vec2) => void) => (
    <>
      <NumberField label={`${label} X`} value={p[0]} onChange={(v) => onChange([v, p[1]])} />
      <NumberField label={`${label} Y`} value={p[1]} onChange={(v) => onChange([p[0], v])} />
    </>
  );

  let fields;
  switch (entity.type) {
    case 'line':
      fields = (
        <>
          <NumberField
            label="Length"
            min={0.001}
            value={dist(entity.a, entity.b)}
            onChange={(v) => updateEntities((ents) => setLineLength(ents, entity.id, v), key('length'))}
          />
          <NumberField
            label="Angle"
            kind="angle"
            value={round(Math.atan2(entity.b[1] - entity.a[1], entity.b[0] - entity.a[0]) * DEG, 3)}
            onChange={(deg) => {
              const len = dist(entity.a, entity.b);
              const b: Vec2 = [entity.a[0] + len * Math.cos(deg / DEG), entity.a[1] + len * Math.sin(deg / DEG)];
              updateEntities((ents) => moveLinePoint(ents, entity.b, b), key('angle'));
            }}
          />
          {point('Start', entity.a, (p) => updateEntities((ents) => moveLinePoint(ents, entity.a, p), key('a')))}
          {point('End', entity.b, (p) => updateEntities((ents) => moveLinePoint(ents, entity.b, p), key('b')))}
        </>
      );
      break;
    case 'rect':
      fields = (
        <>
          <NumberField label="Width" min={0.001} value={entity.w} onChange={(w) => patch('w', { w })} />
          <NumberField label="Height" min={0.001} value={entity.h} onChange={(h) => patch('h', { h })} />
          <NumberField label="Corner X" value={entity.x} onChange={(x) => patch('x', { x })} />
          <NumberField label="Corner Y" value={entity.y} onChange={(y) => patch('y', { y })} />
        </>
      );
      break;
    case 'circle':
      fields = (
        <>
          <NumberField label="Diameter" min={0.001} value={entity.r * 2} onChange={(d) => patch('r', { r: d / 2 })} />
          {point('Center', entity.c, (c) => patch('c', { c }))}
        </>
      );
      break;
    case 'arc':
      fields = (
        <>
          <NumberField label="Radius" min={0.001} value={entity.r} onChange={(r) => patch('r', { r })} />
          <NumberField
            label="Start angle"
            kind="angle"
            value={round(entity.start * DEG, 3)}
            onChange={(v) => patch('start', { start: v / DEG })}
          />
          <NumberField
            label="End angle"
            kind="angle"
            value={round(entity.end * DEG, 3)}
            onChange={(v) => patch('end', { end: v / DEG })}
          />
          {point('Center', entity.c, (c) => patch('c', { c }))}
        </>
      );
      break;
    case 'polygon':
      fields = (
        <>
          <NumberField label="Radius" min={0.001} value={entity.r} onChange={(r) => patch('r', { r })} />
          <NumberField
            label="Sides"
            kind="count"
            min={3}
            max={64}
            value={entity.sides}
            onChange={(sides) => patch('sides', { sides })}
          />
          <NumberField
            label="Rotation"
            kind="angle"
            value={round(entity.angle * DEG, 3)}
            onChange={(v) => patch('angle', { angle: v / DEG })}
          />
          {point('Center', entity.c, (c) => patch('c', { c }))}
        </>
      );
      break;
  }

  return (
    <Section
      title={`Selected ${ENTITY_LABEL[entity.type]}`}
      right={
        <button className="text-muted hover:text-red-400" title="Delete (Del)" onClick={() => deleteEntity(entity.id)}>
          <Trash2 size={13} />
        </button>
      }
    >
      {fields}
    </Section>
  );
}

export function SketchPanel() {
  const sketch = useActiveSketch();
  const selectedEntityId = useCad((s) => s.selectedEntityId);
  const { selectEntity, finishSketch, startExtrude } = useCad.getState();
  if (!sketch) return null;

  const selected = sketch.entities.find((e) => e.id === selectedEntityId) ?? null;
  const closed = hasClosedProfile(sketch.entities);

  return (
    <>
      <Section title={`${sketch.name} · ${sketch.plane} plane`}>
        <p className="text-[12px] leading-relaxed text-muted">
          Draw with the tools below. Click a dimension label to type an exact value such as <span className="font-mono text-sky-300">50 mm</span>.
        </p>
        <div className="flex gap-1.5 pt-1">
          <ToolButton icon={Check} label="Finish sketch" onClick={finishSketch} />
          <ToolButton
            icon={ArrowUpFromLine}
            label="Extrude"
            variant="primary"
            disabled={!closed}
            title={closed ? 'Finish and extrude' : 'Draw a closed profile first'}
            onClick={() => startExtrude(sketch.id)}
          />
        </div>
        <p className={`text-[11px] ${closed ? 'text-emerald-400' : 'text-muted'}`}>
          {closed ? 'Closed profile found — ready to extrude.' : 'No closed profile yet.'}
        </p>
      </Section>

      {selected && <EntityEditor key={selected.id} entity={selected} />}

      <Section title={`Entities (${sketch.entities.length})`}>
        {sketch.entities.length === 0 && <p className="text-[11px] text-muted">Nothing drawn yet.</p>}
        <div className="space-y-0.5">
          {sketch.entities.map((e, i) => {
            const Icon = SKETCH_TOOL_ICONS[e.type];
            return (
              <button
                key={e.id}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] ${
                  e.id === selectedEntityId ? 'bg-accent/25 text-sky-100' : 'hover:bg-panel-3'
                }`}
                onClick={() => selectEntity(e.id === selectedEntityId ? null : e.id)}
              >
                <Icon size={13} className="text-sky-400" />
                {ENTITY_LABEL[e.type]} {i + 1}
              </button>
            );
          })}
        </div>
      </Section>
    </>
  );
}
