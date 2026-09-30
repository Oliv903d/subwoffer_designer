import { Box, Cylinder, Focus, Globe, House, PencilRuler, Speaker, X } from 'lucide-react';
import { useActiveSketch, useCad, type ViewName } from '../store/cadStore';
import type { SketchPlane } from '../types/cad';
import { PLANE_COLORS } from '../geometry/planes';

const VIEWS: { name: ViewName; label: string }[] = [
  { name: 'front', label: 'Front' },
  { name: 'top', label: 'Top' },
  { name: 'right', label: 'Right' },
];

const overlayBtn =
  'rounded px-2 py-1 text-[11px] text-text hover:bg-panel-3 disabled:opacity-40 flex items-center gap-1';

export function ViewControls() {
  const projection = useCad((s) => s.projection);
  const mode = useCad((s) => s.mode);
  const { setProjection, requestView } = useCad.getState();
  if (mode === 'sketch') return null;

  return (
    <div className="absolute left-3 top-3 flex items-center gap-0.5 rounded-md border border-line bg-panel/90 p-0.5 shadow-lg backdrop-blur">
      <button className={overlayBtn} title="Home view" onClick={() => requestView('home')}>
        <House size={13} />
      </button>
      <button className={overlayBtn} title="Zoom to fit" onClick={() => requestView('fit')}>
        <Focus size={13} /> Fit
      </button>
      <div className="mx-0.5 h-4 w-px bg-line" />
      {VIEWS.map((v) => (
        <button key={v.name} className={overlayBtn} onClick={() => requestView(v.name)}>
          {v.label}
        </button>
      ))}
      <div className="mx-0.5 h-4 w-px bg-line" />
      <div className="flex rounded bg-panel-2 p-0.5">
        {(['perspective', 'orthographic'] as const).map((p) => (
          <button
            key={p}
            className={`rounded px-2 py-0.5 text-[11px] ${projection === p ? 'bg-accent text-white' : 'text-muted hover:text-text'}`}
            onClick={() => setProjection(p)}
          >
            {p === 'perspective' ? 'Persp' : 'Ortho'}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EmptyState() {
  const empty = useCad((s) => s.objects.length === 0);
  const mode = useCad((s) => s.mode);
  const { startNewSketch, addPrimitive, openSubwoofer } = useCad.getState();
  if (!empty || mode !== 'model') return null;

  const btn =
    'flex items-center gap-2 rounded-md border border-line bg-panel-2 px-3 py-2 text-[12px] hover:border-accent hover:bg-panel-3';
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto w-[380px] rounded-lg border border-line bg-panel/95 p-5 text-center shadow-2xl backdrop-blur">
        <h2 className="text-[15px] font-semibold">Start modeling</h2>
        <p className="mt-1 text-[12px] text-muted">Create a sketch or add a primitive to get started.</p>
        <button
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-white hover:bg-blue-500"
          onClick={openSubwoofer}
        >
          <Speaker size={16} /> Design a subwoofer box
        </button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className={`${btn} border-accent/60 bg-accent/15`} onClick={startNewSketch}>
            <PencilRuler size={15} className="text-sky-300" /> New Sketch
          </button>
          <button className={btn} onClick={() => addPrimitive('box')}>
            <Box size={15} /> Add Box
          </button>
          <button className={btn} onClick={() => addPrimitive('cylinder')}>
            <Cylinder size={15} /> Add Cylinder
          </button>
          <button className={btn} onClick={() => addPrimitive('sphere')}>
            <Globe size={15} /> Add Sphere
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlanePickerOverlay() {
  const mode = useCad((s) => s.mode);
  const { createSketch, cancelPickPlane } = useCad.getState();
  if (mode !== 'pickPlane') return null;

  const planes: { plane: SketchPlane; label: string }[] = [
    { plane: 'XY', label: 'XY · Front' },
    { plane: 'XZ', label: 'XZ · Top / ground' },
    { plane: 'YZ', label: 'YZ · Side' },
  ];
  return (
    <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-md border border-line bg-panel/95 px-3 py-2 shadow-xl">
      <span className="text-[12px] font-medium">Select a sketch plane:</span>
      {planes.map(({ plane, label }) => (
        <button
          key={plane}
          className="flex items-center gap-1.5 rounded border border-line bg-panel-2 px-2 py-1 text-[12px] hover:border-accent"
          onClick={() => createSketch(plane)}
        >
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PLANE_COLORS[plane] }} />
          {label}
        </button>
      ))}
      <button className="rounded p-1 text-muted hover:bg-panel-3 hover:text-text" title="Cancel (Esc)" onClick={cancelPickPlane}>
        <X size={14} />
      </button>
    </div>
  );
}

export function SketchBanner() {
  const sketch = useActiveSketch();
  const mode = useCad((s) => s.mode);
  const finishSketch = useCad((s) => s.finishSketch);
  if (mode !== 'sketch' || !sketch) return null;

  return (
    <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 rounded-md border border-sky-500/40 bg-[#0f1a2a]/95 px-3 py-1.5 shadow-xl">
      <PencilRuler size={14} className="text-sky-300" />
      <span className="text-[12px]">
        Sketch mode · <b>{sketch.name}</b> on {sketch.plane}
      </span>
      <button className="rounded bg-accent px-2 py-0.5 text-[12px] text-white hover:bg-blue-500" onClick={finishSketch}>
        Finish Sketch
      </button>
    </div>
  );
}
