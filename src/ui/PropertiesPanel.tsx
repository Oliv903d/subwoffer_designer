import { Copy, Eye, EyeOff, PencilRuler, Trash2, ArrowUpFromLine, Check, X, ArrowUpDown, Speaker } from 'lucide-react';
import { findSketch, useCad, useSelectedObject } from '../store/cadStore';
import type { CadObject, SolidObject, Transform, Vec3 } from '../types/cad';
import { PRIMITIVES } from '../geometry/primitives';
import { hasClosedProfile } from '../sketch/profiles';
import { NumberField, Section, TextField, ToolButton } from './controls';
import { SketchPanel } from './SketchPanel';
import { EnclosureShapeSection, SubwooferPanel } from './SubwooferPanel';

const AXIS_COLORS = ['#f87171', '#4ade80', '#60a5fa'];
const AXES = ['X', 'Y', 'Z'];

function TransformSection({ obj }: { obj: SolidObject }) {
  const setTransform = useCad((s) => s.setTransform);
  const t = obj.transform;

  const edit = (field: keyof Transform, axis: number, value: number) => {
    const vec = [...t[field]] as Vec3;
    vec[axis] = value;
    setTransform(obj.id, { ...t, [field]: vec }, `${obj.id}:${field}:${axis}`);
  };

  const rows: { field: keyof Transform; title: string; kind: 'length' | 'angle' | 'scale' }[] = [
    { field: 'position', title: 'Position', kind: 'length' },
    { field: 'rotation', title: 'Rotation', kind: 'angle' },
    ...(obj.kind === 'enclosure' ? [] : [{ field: 'scale' as const, title: 'Scale', kind: 'scale' as const }]),
  ];

  return (
    <>
      {rows.map(({ field, title, kind }) => (
        <Section key={field} title={title}>
          {AXES.map((axis, i) => (
            <NumberField
              key={axis}
              label={`${title} ${axis}`}
              labelColor={AXIS_COLORS[i]}
              kind={kind}
              min={kind === 'scale' ? 0.001 : undefined}
              value={t[field][i]}
              onChange={(v) => edit(field, i, v)}
            />
          ))}
        </Section>
      ))}
    </>
  );
}

function DimensionsSection({ obj }: { obj: CadObject }) {
  const updateObject = useCad((s) => s.updateObject);
  const updateEnclosure = useCad((s) => s.updateEnclosure);
  const setRightTab = useCad((s) => s.setRightTab);
  const editSketch = useCad((s) => s.editSketch);
  const startExtrude = useCad((s) => s.startExtrude);

  if (obj.kind === 'enclosure') {
    return (
      <>
        <EnclosureShapeSection o={obj} update={(fn, edited, key) => updateEnclosure(obj.id, fn, edited, key)} />
        <div className="border-b border-line px-3 py-2.5">
          <ToolButton icon={Speaker} label="Open Subwoofer tab" onClick={() => setRightTab('subwoofer')} />
        </div>
      </>
    );
  }

  if (obj.kind === 'primitive') {
    const def = PRIMITIVES[obj.shape];
    return (
      <Section title="Dimensions">
        {def.params.map((p) => (
          <NumberField
            key={p.key}
            label={p.label}
            min={p.min}
            value={obj.params[p.key]}
            onChange={(v) =>
              updateObject(
                obj.id,
                (o) => (o.kind === 'primitive' ? { ...o, params: { ...o.params, [p.key]: v } } : o),
                `${obj.id}:param:${p.key}`,
              )
            }
          />
        ))}
        {obj.shape === 'tube' && obj.params.innerRadius >= obj.params.outerRadius && (
          <p className="text-[11px] text-amber-400">Inner radius must be smaller than outer radius.</p>
        )}
      </Section>
    );
  }

  if (obj.kind === 'extrude') {
    return (
      <Section title="Extrude">
        <NumberField
          label="Distance"
          value={obj.distance}
          onChange={(v) => {
            if (Math.abs(v) < 0.001) return;
            updateObject(obj.id, (o) => (o.kind === 'extrude' ? { ...o, distance: v } : o), `${obj.id}:distance`);
          }}
        />
        <p className="text-[11px] text-muted">
          Profile from {obj.sourceSketchName || 'sketch'} on {obj.plane} plane. Negative distance extrudes the other way.
        </p>
      </Section>
    );
  }

  const closed = hasClosedProfile(obj.entities);
  return (
    <Section title="Sketch">
      <div className="flex justify-between text-[12px]">
        <span className="text-muted">Plane</span>
        <span>{obj.plane}</span>
      </div>
      <div className="flex justify-between text-[12px]">
        <span className="text-muted">Entities</span>
        <span>{obj.entities.length}</span>
      </div>
      <NumberField
        label="Plane offset"
        value={obj.offset}
        onChange={(v) => updateObject(obj.id, (o) => (o.kind === 'sketch' ? { ...o, offset: v } : o), `${obj.id}:offset`)}
      />
      <div className="flex gap-1.5 pt-1">
        <ToolButton icon={PencilRuler} label="Edit sketch" onClick={() => editSketch(obj.id)} />
        <ToolButton
          icon={ArrowUpFromLine}
          label="Extrude"
          variant="primary"
          disabled={!closed}
          title={closed ? 'Extrude this sketch' : 'This sketch has no closed profile'}
          onClick={() => startExtrude(obj.id)}
        />
      </div>
      {!closed && <p className="text-[11px] text-amber-400">No closed profile — close the shape to extrude it.</p>}
    </Section>
  );
}

function ObjectProperties({ obj }: { obj: CadObject }) {
  const { renameObject, toggleVisibility, duplicateObject, deleteObject } = useCad.getState();
  const kindLabel =
    obj.kind === 'primitive'
      ? PRIMITIVES[obj.shape].label
      : obj.kind === 'sketch'
        ? 'Sketch'
        : obj.kind === 'enclosure'
          ? 'Subwoofer box'
          : 'Extrusion';

  return (
    <>
      <Section title={kindLabel}>
        <TextField value={obj.name} onCommit={(n) => renameObject(obj.id, n)} className="w-full" />
        <div className="flex flex-wrap gap-1 pt-1">
          <ToolButton
            icon={obj.visible ? EyeOff : Eye}
            label={obj.visible ? 'Hide' : 'Show'}
            onClick={() => toggleVisibility(obj.id)}
          />
          <ToolButton icon={Copy} label="Duplicate" shortcut="Ctrl+D" onClick={() => duplicateObject(obj.id)} />
          <ToolButton icon={Trash2} label="Delete" shortcut="Del" onClick={() => deleteObject(obj.id)} />
        </div>
      </Section>
      <DimensionsSection obj={obj} />
      {obj.kind !== 'sketch' && <TransformSection obj={obj} />}
    </>
  );
}

function ExtrudePanel() {
  const extrude = useCad((s) => s.extrude);
  const sketch = useCad((s) => findSketch(s.objects, s.extrude?.sketchId ?? null));
  const { setExtrudeDistance, confirmExtrude, cancelExtrude } = useCad.getState();
  if (!extrude || !sketch) return null;

  return (
    <Section title="Extrude">
      <p className="text-[12px]">
        Profile: <span className="text-sky-300">{sketch.name}</span>
      </p>
      <NumberField
        label="Distance"
        value={extrude.distance}
        onChange={(v) => Math.abs(v) >= 0.001 && setExtrudeDistance(v)}
      />
      <ToolButton icon={ArrowUpDown} label="Flip direction" onClick={() => setExtrudeDistance(-extrude.distance)} />
      <div className="flex gap-1.5 pt-2">
        <ToolButton icon={Check} label="OK" variant="primary" onClick={confirmExtrude} shortcut="Enter" />
        <ToolButton icon={X} label="Cancel" onClick={cancelExtrude} shortcut="Esc" />
      </div>
      <p className="pt-1 text-[11px] text-muted">The preview updates as you type. Press OK to create the solid.</p>
    </Section>
  );
}

function ProjectInfo() {
  const count = useCad((s) => s.objects.length);
  return (
    <Section title="Nothing selected">
      <p className="text-[12px] leading-relaxed text-muted">
        Select an object in the viewport or the browser to edit its dimensions and position.
      </p>
      <p className="text-[12px] text-muted">
        {count} object{count === 1 ? '' : 's'} in this project.
      </p>
      <ul className="list-disc space-y-0.5 pl-4 pt-1 text-[11px] text-muted">
        <li>Left click: select</li>
        <li>Right drag: orbit</li>
        <li>Middle drag: pan</li>
        <li>Wheel: zoom</li>
      </ul>
    </Section>
  );
}

export function PropertiesPanel() {
  const mode = useCad((s) => s.mode);
  const tab = useCad((s) => s.rightTab);
  const setTab = useCad((s) => s.setRightTab);
  const selected = useSelectedObject();

  let content;
  if (mode === 'extrude') content = <ExtrudePanel />;
  else if (mode === 'sketch') content = <SketchPanel />;
  else if (tab === 'subwoofer') content = <SubwooferPanel />;
  else if (selected) content = <ObjectProperties key={selected.id} obj={selected} />;
  else content = <ProjectInfo />;

  const tabs = [
    { id: 'properties', label: 'Properties' },
    { id: 'subwoofer', label: 'Subwoofer' },
  ] as const;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex h-8 items-stretch border-b border-line text-[11px] font-semibold uppercase tracking-wider">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`flex-1 border-b-2 ${
              tab === t.id || (mode !== 'model' && t.id === 'properties')
                ? 'border-accent text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
            disabled={mode !== 'model'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">{content}</div>
    </aside>
  );
}
