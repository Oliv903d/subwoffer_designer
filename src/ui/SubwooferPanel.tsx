import { useCallback, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Crosshair, Lock, LockOpen, Ruler, Speaker, WandSparkles, X } from 'lucide-react';
import { useCad, useSelectedObject } from '../store/cadStore';
import type { BoxFace, DriverMount, EnclosureDim, EnclosureObject, SlantSide } from '../types/cad';
import {
  analyze,
  autoPlaceRoundPorts,
  BOX_FACES,
  centerMount,
  cutList,
  evenDriverPositions,
  innerWidth,
  isPorted,
  topDepth,
} from '../subwoofer/enclosure';
import { DRIVER_PRESETS } from '../subwoofer/presets';
import { FACE_LABEL, faceInfo, type Face } from '../subwoofer/faces';
import { formatArea, formatVolume } from '../subwoofer/format';
import { formatLength, round } from '../utils/units';
import { NumberField, Section, TextField, ToolButton } from './controls';
import { CutBlueprintDialog } from './CutBlueprintDialog';

type Update = (
  fn: (o: EnclosureObject) => EnclosureObject,
  edited?: EnclosureDim | null,
  key?: string,
  redesign?: boolean,
) => void;

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded bg-panel-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          className={`flex-1 rounded px-2 py-1 text-[12px] ${value === o.value ? 'bg-accent text-white' : 'text-muted hover:text-text'}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children, tone }: { label: string; children: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : tone === 'bad' ? 'text-red-400' : '';
  return (
    <div className="flex justify-between gap-2 text-[12px]">
      <span className="text-muted">{label}</span>
      <span className={`text-right font-mono ${color}`}>{children}</span>
    </div>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-blue-500" />
      {children}
    </label>
  );
}

const tone = (ratio: number): 'good' | 'warn' | 'bad' => (Math.abs(ratio) <= 0.05 ? 'good' : Math.abs(ratio) <= 0.15 ? 'warn' : 'bad');

function DriverSection({ o, update }: { o: EnclosureObject; update: Update }) {
  const d = o.driver;
  const key = (k: string) => `${o.id}:driver:${k}`;
  const set = (k: keyof typeof d) => (v: number) => update((x) => ({ ...x, driver: { ...x.driver, [k]: v } }), null, key(k), true);
  const preset = DRIVER_PRESETS.findIndex((p) => p.name === d.name);

  return (
    <Section title="Subwoofer data">
      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-[12px] text-muted">Preset</span>
        <select
          className="min-w-0 flex-1 rounded border border-line bg-panel-2 px-1.5 py-1 text-[12px] outline-none focus:border-accent"
          value={preset}
          onChange={(e) => {
            const p = DRIVER_PRESETS[Number(e.target.value)];
            if (p) update((x) => ({ ...x, driver: { ...p } }), null, undefined, true);
          }}
        >
          <option value={-1}>Custom (my subwoofer)</option>
          {DRIVER_PRESETS.map((p, i) => (
            <option key={p.name} value={i}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-[12px] text-muted">Model</span>
        <TextField value={d.name} onCommit={(name) => update((x) => ({ ...x, driver: { ...x.driver, name } }))} className="min-w-0 flex-1" />
      </label>
      <NumberField
        label="How many"
        kind="count"
        min={1}
        max={4}
        value={o.drivers.length}
        onChange={(n) => update((x) => ({ ...x, drivers: evenDriverPositions(x, n) }), null, undefined, true)}
      />
      <p className="pt-1 text-[11px] text-muted">From the data sheet (Thiele/Small parameters):</p>
      <NumberField label="Fs" kind="plain" suffix="Hz" min={5} max={200} value={d.fs} onChange={set('fs')} title="Free-air resonance" />
      <NumberField label="Qts" kind="plain" min={0.05} max={3} step={0.01} value={d.qts} onChange={set('qts')} title="Total Q" />
      <NumberField label="Vas" kind="volume" min={0.1} value={d.vas} onChange={set('vas')} title="Equivalent compliance volume" />
      <NumberField label="Xmax" min={0.5} value={d.xmax} onChange={set('xmax')} title="One-way linear excursion" />
      <NumberField label="Sd" kind="plain" suffix="cm²" min={10} value={d.sd} onChange={set('sd')} title="Cone area" />
      <p className="pt-1 text-[11px] text-muted">Size (for the hole and fit):</p>
      <NumberField label="Cutout Ø" min={20} value={d.cutoutDiameter} onChange={set('cutoutDiameter')} />
      <NumberField label="Outer Ø" min={20} value={d.outerDiameter} onChange={set('outerDiameter')} title="Flange / basket outer diameter" />
      <NumberField label="Mount depth" min={10} value={d.mountingDepth} onChange={set('mountingDepth')} />
      <NumberField label="Displacement" kind="volume" min={0} value={d.displacement} onChange={set('displacement')} title="Air volume the subwoofer takes up" />
    </Section>
  );
}

function TargetSection({ o, update }: { o: EnclosureObject; update: Update }) {
  const units = useCad((s) => s.units);
  const a = analyze(o);
  const calc = a.targets.calculated;
  const setDesign = (patch: Partial<EnclosureObject['design']>, key?: string) =>
    update((x) => ({ ...x, design: { ...x.design, ...patch } }), null, key, true);

  return (
    <Section title="Box type & target">
      <Segmented
        value={o.design.boxType}
        options={[
          { value: 'sealed', label: 'Sealed' },
          { value: 'ported', label: 'Ported' },
        ]}
        onChange={(boxType) => setDesign({ boxType, tuning: null })}
      />
      {o.design.boxType === 'sealed' && (
        <NumberField
          label="Target Qtc"
          kind="plain"
          min={0.5}
          max={1.5}
          step={0.01}
          value={o.design.qtc}
          onChange={(qtc) => setDesign({ qtc }, `${o.id}:qtc`)}
          title="0.707 = tight and flat, higher = more boom"
        />
      )}
      <Toggle checked={o.design.targetVolume === null} onChange={(auto) => setDesign({ targetVolume: auto ? null : round(a.targets.vb ?? 50, 1) })}>
        Calculate volume from subwoofer data
      </Toggle>
      {o.design.targetVolume !== null && (
        <NumberField
          label="Net volume"
          kind="volume"
          min={1}
          value={o.design.targetVolume}
          onChange={(v) => setDesign({ targetVolume: v }, `${o.id}:target`)}
          title="E.g. the manufacturer's recommendation"
        />
      )}
      {isPorted(o) && (
        <>
          <Toggle checked={o.design.tuning === null} onChange={(auto) => setDesign({ tuning: auto ? null : round(a.targets.fb ?? 32, 1) })}>
            Calculate tuning from subwoofer data
          </Toggle>
          {o.design.tuning !== null && (
            <NumberField
              label="Tuning (Fb)"
              kind="plain"
              suffix="Hz"
              min={10}
              max={120}
              value={o.design.tuning}
              onChange={(v) => setDesign({ tuning: v }, `${o.id}:tuning`)}
            />
          )}
        </>
      )}
      <div className="mt-1 rounded bg-panel-2 p-2">
        {calc.vb ? (
          <>
            <Row label="Box needs (net)">{a.targets.vb ? formatVolume(a.targets.vb, units) : '—'}</Row>
            {a.targets.fb && <Row label="Port tuning">{round(a.targets.fb, 1)} Hz</Row>}
            {calc.f3 && o.design.targetVolume === null && <Row label="Bass reaches (−3 dB)">≈ {round(calc.f3, 0)} Hz</Row>}
          </>
        ) : (
          <p className="text-[11px] text-amber-300">{calc.note} Enter a custom net volume.</p>
        )}
      </div>
    </Section>
  );
}

export function EnclosureShapeSection({ o, update }: { o: EnclosureObject; update: Update }) {
  const [seatOpen, setSeatOpen] = useState(false);
  const s = o.shape;
  const manual = (x: EnclosureObject): EnclosureObject => ({ ...x, design: { ...x.design, autoShape: false } });
  const set = (dim: 'width' | 'height' | 'depth' | 'thickness' | 'slantAngle') => (v: number) =>
    update(
      (x) => manual({ ...x, shape: { ...x.shape, [dim]: v } }),
      dim === 'width' || dim === 'height' || dim === 'depth' ? dim : null,
      `${o.id}:shape:${dim}`,
    );
  const setTopDepth = (top: number) =>
    update(
      (x) =>
        manual({
          ...x,
          shape: { ...x.shape, slantAngle: round((Math.atan((x.shape.depth - top) / x.shape.height) * 180) / Math.PI, 2) },
        }),
      'depth',
      `${o.id}:shape:top`,
    );
  const locked = o.design.lockVolume;
  const adjustLabel = (d: EnclosureDim) => (locked && o.design.adjust === d ? ' (auto)' : '');

  return (
    <Section
      title="Box size (outside)"
      right={
        <button
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${locked ? 'bg-emerald-500/20 text-emerald-300' : 'text-muted hover:text-text'}`}
          onClick={() => update((x) => ({ ...x, design: { ...x.design, lockVolume: !locked } }))}
          title="When on, changing one size changes another so the volume stays perfect"
        >
          {locked ? <Lock size={11} /> : <LockOpen size={11} />} Keep volume
        </button>
      }
    >
      <p className="text-[11px] text-muted">
        {o.design.autoShape
          ? 'Shape: automatic — it is redesigned when you change the subwoofer data.'
          : 'Shape: your own — subwoofer changes keep this shape (volume still kept).'}
      </p>
      <NumberField label={`Width${adjustLabel('width')}`} min={40} value={s.width} onChange={set('width')} />
      <NumberField label={`Height${adjustLabel('height')}`} min={40} value={s.height} onChange={set('height')} />
      <NumberField label={`Depth${adjustLabel('depth')}`} min={40} value={s.depth} onChange={set('depth')} />
      <NumberField label="Wood thickness" min={3} max={60} value={s.thickness} onChange={set('thickness')} />
      {locked && (
        <label className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-[12px] text-muted">Auto-adjust</span>
          <select
            className="min-w-0 flex-1 rounded border border-line bg-panel-2 px-1.5 py-1 text-[12px] outline-none focus:border-accent"
            value={o.design.adjust}
            onChange={(e) => update((x) => ({ ...x, design: { ...x.design, adjust: e.target.value as EnclosureDim } }))}
          >
            <option value="depth">Depth</option>
            <option value="height">Height</option>
            <option value="width">Width</option>
          </select>
        </label>
      )}
      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-[12px] text-muted">Angled panel</span>
        <select
          className="min-w-0 flex-1 rounded border border-line bg-panel-2 px-1.5 py-1 text-[12px] outline-none focus:border-accent"
          value={s.slant}
          onChange={(e) =>
            update((x) =>
              manual({
                ...x,
                shape: { ...x.shape, slant: e.target.value as SlantSide, slantAngle: x.shape.slantAngle || 15 },
              }),
            )
          }
        >
          <option value="none">None (square box)</option>
          <option value="front">Front (subwoofer side)</option>
          <option value="back">Back (behind a seat)</option>
        </select>
      </label>
      {s.slant !== 'none' && (
        <>
          <NumberField label="Angle" kind="angle" min={0} max={60} value={s.slantAngle} onChange={set('slantAngle')} />
          <NumberField label="Depth at top" min={40} value={round(topDepth(s), 1)} onChange={setTopDepth} />
          <p className="text-[11px] text-muted">Tip: drag the orange ball on the top edge to change the angle.</p>
        </>
      )}
      <button className="text-left text-[12px] text-sky-300 hover:underline" onClick={() => setSeatOpen((v) => !v)}>
        {seatOpen ? '▾' : '▸'} Fit behind an angled seat…
      </button>
      {seatOpen && <SeatFit o={o} update={update} onDone={() => setSeatOpen(false)} />}
      <Toggle checked={o.showInside} onChange={(showInside) => update((x) => ({ ...x, showInside }))}>
        See-through (show port inside)
      </Toggle>
    </Section>
  );
}

/** Measure the space behind the seat; the box gets that height/depths and the width adjusts to keep the volume. */
function SeatFit({ o, update, onDone }: { o: EnclosureObject; update: Update; onDone: () => void }) {
  const [height, setHeight] = useState(o.shape.height);
  const [bottom, setBottom] = useState(o.shape.depth);
  const [top, setTop] = useState(Math.round(topDepth(o.shape)));
  const valid = top > 0 && top <= bottom && height > 0;

  return (
    <div className="space-y-1.5 rounded bg-panel-2 p-2">
      <p className="text-[11px] text-muted">
        Measure the space behind the seat. The back panel follows the seat angle and the width changes to keep the volume.
      </p>
      <NumberField label="Height" min={40} value={height} onChange={setHeight} />
      <NumberField label="Depth at floor" min={40} value={bottom} onChange={setBottom} />
      <NumberField label="Depth at top" min={10} value={top} onChange={setTop} />
      <Row label="Seat angle">{valid ? `${round((Math.atan((bottom - top) / height) * 180) / Math.PI, 1)}°` : '—'}</Row>
      <ToolButton
        icon={Check}
        label="Apply"
        variant="primary"
        disabled={!valid}
        onClick={() => {
          update((x) => ({
            ...x,
            shape: {
              ...x.shape,
              height,
              depth: bottom,
              slant: bottom > top ? 'back' : 'none',
              slantAngle: round((Math.atan((bottom - top) / height) * 180) / Math.PI, 2),
            },
            design: { ...x.design, lockVolume: true, adjust: 'width', autoShape: false },
          }));
          onDone();
        }}
      />
    </div>
  );
}

const PANEL_DIMS: Record<Face, [string, string]> = {
  top: ['width', 'depth'],
  bottom: ['width', 'depth'],
  front: ['width', 'height'],
  back: ['width', 'height'],
  left: ['height', 'depth'],
  right: ['height', 'depth'],
};

function SelectedPanelSection({ o, face, update }: { o: EnclosureObject; face: Face; update: Update }) {
  const units = useCad((s) => s.units);
  const setSelectedFace = useCad((s) => s.setSelectedFace);
  const info = faceInfo(o, face);
  const p = info.panel;
  const tiltable = face === 'front' || face === 'back';
  const tilt = o.shape.slant === face ? o.shape.slantAngle : 0;

  return (
    <Section
      title={`Selected: ${FACE_LABEL[face]}`}
      right={
        <button className="text-muted hover:text-text" title="Deselect side" onClick={() => setSelectedFace(null)}>
          <X size={13} />
        </button>
      }
    >
      <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2">
        <div className="text-[11px] uppercase tracking-wider text-amber-300">Cut size</div>
        <div className="font-mono text-[15px] text-amber-100">
          {formatLength(p.a, units)} × {formatLength(p.b, units)}
        </div>
        <div className="text-[11px] text-muted">
          {p.qty > 1 ? `Cut ${p.qty} of these · ` : ''}
          {PANEL_DIMS[face][0]} × {PANEL_DIMS[face][1]} · {formatLength(o.shape.thickness, units)} thick
        </div>
        {p.note && <div className="text-[11px] text-amber-200">{p.note}</div>}
      </div>
      <p className="text-[11px] text-muted">Drag the blue side (or the orange arrow) in the view to make the box bigger or smaller.</p>
      {tiltable && (
        <NumberField
          label="Tilt this side"
          kind="angle"
          min={0}
          max={60}
          value={tilt}
          onChange={(angle) =>
            update(
              (x) => ({
                ...x,
                shape: { ...x.shape, slant: angle > 0 ? face : 'none', slantAngle: angle > 0 ? angle : x.shape.slantAngle },
                design: { ...x.design, autoShape: false },
              }),
              null,
              `${o.id}:tilt`,
            )
          }
          title="Only the front or the back can be tilted (one at a time)"
        />
      )}
    </Section>
  );
}

function ResultsSection({ o }: { o: EnclosureObject }) {
  const units = useCad((s) => s.units);
  const a = analyze(o);
  const v = a.volumes;
  const s = o.shape;

  return (
    <Section title="Current box">
      <Row label="Outside size">
        {formatLength(s.width, units)} × {formatLength(s.height, units)} × {formatLength(s.depth, units)}
      </Row>
      <Row label="Net volume now" tone={a.volumeError === null ? undefined : tone(a.volumeError)}>
        {formatVolume(v.net, units)}
      </Row>
      <Row label="Needed">{a.targets.vb ? formatVolume(a.targets.vb, units) : '—'}</Row>
      {a.targets.vb && (
        <div className="h-1.5 overflow-hidden rounded bg-panel-3">
          <div
            className={`h-full ${a.volumeError !== null && Math.abs(a.volumeError) <= 0.05 ? 'bg-emerald-400' : 'bg-amber-400'}`}
            style={{ width: `${Math.min(100, (v.net / a.targets.vb) * 100)}%` }}
          />
        </div>
      )}
      <Row label="Air inside (gross)">{formatVolume(v.gross, units)}</Row>
      <Row label="− Subwoofers">{formatVolume(v.drivers, units)}</Row>
      {isPorted(o) && <Row label="− Port">{formatVolume(v.port, units)}</Row>}

      {a.port && (
        <div className="mt-2 space-y-1 rounded bg-panel-2 p-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Port</div>
          <Row label="Area minimum">{formatArea(a.port.minArea, units)}</Row>
          <Row label="Area recommended">{formatArea(a.port.recommendedArea, units)}</Row>
          <Row label="Area now" tone={a.port.area >= a.port.recommendedArea * 0.95 ? 'good' : a.port.area >= a.port.minArea ? 'warn' : 'bad'}>
            {formatArea(a.port.area, units)}
          </Row>
          <Row label="Length needed">{a.port.requiredLength ? formatLength(a.port.requiredLength, units) : '—'}</Row>
          <Row
            label="Length now"
            tone={a.port.requiredLength ? tone((a.port.length - a.port.requiredLength) / a.port.requiredLength) : undefined}
          >
            {formatLength(a.port.length, units)}
          </Row>
          <Row label="Tuned to" tone={a.targets.fb ? tone((a.port.tuning - a.targets.fb) / a.targets.fb) : undefined}>
            {round(a.port.tuning, 1)} Hz
          </Row>
          <Row label="Air speed" tone={a.port.velocity <= 17 ? 'good' : a.port.velocity <= 25 ? 'warn' : 'bad'}>
            {round(a.port.velocity, 1)} m/s
          </Row>
          {a.port.folded && <p className="text-[11px] text-muted">The port folds up along the back wall to fit.</p>}
        </div>
      )}
    </Section>
  );
}

function PortSection({ o, update }: { o: EnclosureObject; update: Update }) {
  const p = o.port;
  const units = useCad((s) => s.units);
  const set = (patch: Partial<EnclosureObject['port']>, key?: string) => update((x) => ({ ...x, port: { ...x.port, ...patch } }), null, key);

  return (
    <Section title="Port">
      <Segmented
        value={p.shape}
        options={[
          { value: 'slot', label: 'Slot (bottom)' },
          { value: 'round', label: 'Round tubes' },
        ]}
        onChange={(shape) =>
          update(
            (x) => {
              const next = { ...x, port: { ...x.port, shape } };
              return shape === 'round' && next.port.positions.length === 0
                ? { ...next, port: { ...next.port, positions: autoPlaceRoundPorts(next, 1) } }
                : next;
            },
            null,
            undefined,
            true,
          )
        }
      />
      {p.shape === 'slot' ? (
        <>
          <NumberField label="Slot height" min={10} value={p.slotHeight} onChange={(slotHeight) => set({ slotHeight }, `${o.id}:slotH`)} />
          <Row label="Slot width">{formatLength(innerWidth(o.shape), units)}</Row>
        </>
      ) : (
        <>
          <NumberField label="Inner Ø" min={20} value={p.diameter} onChange={(diameter) => set({ diameter }, `${o.id}:portD`)} />
          <NumberField
            label="How many"
            kind="count"
            min={1}
            max={4}
            value={p.positions.length}
            onChange={(n) => update((x) => ({ ...x, port: { ...x.port, positions: autoPlaceRoundPorts(x, n) } }))}
          />
          <p className="text-[11px] text-muted">Drag the port rings on the box to move them.</p>
        </>
      )}
      <Toggle checked={p.autoLength} onChange={(autoLength) => set({ autoLength })}>
        Set length automatically for the tuning
      </Toggle>
      {!p.autoLength && <NumberField label="Length" min={5} value={p.length} onChange={(length) => set({ length }, `${o.id}:portL`)} />}
    </Section>
  );
}

const SIDE_NAMES: Record<BoxFace, string> = {
  front: 'Front',
  back: 'Back',
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left side',
  right: 'Right side',
};

function PlacementSection({ o, update }: { o: EnclosureObject; update: Update }) {
  const setMount = (i: number, fn: (m: DriverMount, x: EnclosureObject) => DriverMount, key?: string) =>
    update((x) => ({ ...x, drivers: x.drivers.map((m, j) => (j === i ? fn(m, x) : m)) }), null, key);

  return (
    <Section
      title="Subwoofer position"
      right={
        <button
          className="flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200"
          onClick={() => update((x) => ({ ...x, drivers: x.drivers.map((m) => centerMount(x, m.face)) }))}
        >
          <Crosshair size={11} /> Center
        </button>
      }
    >
      <p className="text-[11px] text-muted">
        Drag a subwoofer around the box — over an edge to move it to another side — or choose the side here.
      </p>
      {o.drivers.map((m, i) => (
        <div key={i} className="space-y-1.5">
          {o.drivers.length > 1 && <div className="text-[11px] text-muted">Subwoofer {i + 1}</div>}
          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[12px] text-muted">Side</span>
            <select
              className="min-w-0 flex-1 rounded border border-line bg-panel-2 px-1.5 py-1 text-[12px] outline-none focus:border-accent"
              value={m.face}
              onChange={(e) => setMount(i, (_, x) => centerMount(x, e.target.value as BoxFace))}
            >
              {BOX_FACES.map((f) => (
                <option key={f} value={f}>
                  {SIDE_NAMES[f]}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="Sideways"
            value={m.p[0]}
            onChange={(u) => setMount(i, (q) => ({ ...q, p: [u, q.p[1]] }), `${o.id}:drv${i}u`)}
            title="Across the side, from its centre (front: from the middle of the width)"
          />
          <NumberField
            label={m.face === 'front' ? 'Up the panel' : 'Up / back'}
            value={m.p[1]}
            onChange={(v) => setMount(i, (q) => ({ ...q, p: [q.p[0], v] }), `${o.id}:drv${i}v`)}
            title={
              m.face === 'front'
                ? 'Distance of the centre from the bottom edge, along the front panel'
                : 'From the centre of the side: up on walls, towards the back on the top and bottom'
            }
          />
        </div>
      ))}
    </Section>
  );
}

function CutListSection({ o }: { o: EnclosureObject }) {
  const units = useCad((s) => s.units);
  return (
    <Section title="Cut list">
      <table className="w-full text-[11px]">
        <tbody>
          {cutList(o).map((p) => (
            <tr key={p.name} className="border-b border-line/50 align-top">
              <td className="py-1 pr-1">
                {p.qty}× {p.name}
                {p.note && <div className="text-muted">{p.note}</div>}
              </td>
              <td className="whitespace-nowrap py-1 text-right font-mono">
                {formatLength(p.a, units)} × {formatLength(p.b, units)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-muted">
        Sides are full size; top, bottom, front and back fit between them. Check bevels before cutting.
      </p>
    </Section>
  );
}

export function SubwooferPanel() {
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const closeBlueprint = useCallback(() => setBlueprintOpen(false), []);
  const selected = useSelectedObject();
  const firstBox = useCad((s) => s.objects.find((o): o is EnclosureObject => o.kind === 'enclosure') ?? null);
  const face = useCad((s) => s.selectedFace);
  const mode = useCad((s) => s.mode);
  const { updateEnclosure, createEnclosure, redesignEnclosure, select } = useCad.getState();

  const box = selected?.kind === 'enclosure' ? selected : firstBox;
  if (!box) {
    return (
      <Section title="Subwoofer box">
        <p className="text-[12px] leading-relaxed text-muted">
          Create a box, then type your subwoofer's data — the box is designed automatically as you type.
        </p>
        <ToolButton icon={Speaker} label="Create subwoofer box" variant="primary" disabled={mode !== 'model'} onClick={createEnclosure} />
      </Section>
    );
  }

  const update: Update = (fn, edited, key, redesign) => updateEnclosure(box.id, fn, edited, key, redesign);
  const analysis = analyze(box);

  return (
    <>
      <Section title={box.name}>
        {selected?.id !== box.id && (
          <button className="text-[11px] text-sky-300 hover:underline" onClick={() => select(box.id)}>
            Select this box in the viewport
          </button>
        )}
        <p className="text-[11px] text-muted">Click a side of the box to see its cut size and drag it to reshape the box.</p>
        <ToolButton icon={Ruler} label="Cut Blueprint" onClick={() => setBlueprintOpen(true)} />
        <ToolButton
          icon={WandSparkles}
          label="Redesign box for me"
          disabled={mode !== 'model'}
          onClick={() => redesignEnclosure(box.id)}
          title="Throws away your shape changes and designs a new well-proportioned box"
        />
        {analysis.warnings.length > 0 && (
          <ul className="space-y-1 pt-1">
            {analysis.warnings.map((w) => (
              <li key={w} className="flex gap-1.5 text-[11px] text-amber-300">
                <AlertTriangle size={12} className="mt-px shrink-0" /> {w}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {blueprintOpen && <CutBlueprintDialog box={box} onClose={closeBlueprint} />}
      {face && selected?.id === box.id && <SelectedPanelSection o={box} face={face} update={update} />}
      <ResultsSection o={box} />
      <DriverSection o={box} update={update} />
      <TargetSection o={box} update={update} />
      <EnclosureShapeSection o={box} update={update} />
      {isPorted(box) && <PortSection o={box} update={update} />}
      <PlacementSection o={box} update={update} />
      <CutListSection o={box} />
    </>
  );
}
