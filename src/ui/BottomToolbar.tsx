import {
  ArrowUpFromLine,
  Check,
  Copy,
  MousePointer2,
  Move3d,
  PencilRuler,
  Rotate3d,
  Ruler,
  Scale3d,
  Speaker,
  Trash2,
} from 'lucide-react';
import { useCad, type SketchTool, type TransformTool } from '../store/cadStore';
import { PRIMITIVES, PRIMITIVE_SHAPES } from '../geometry/primitives';
import { formatLength } from '../utils/units';
import { Divider, ToolButton } from './controls';
import { SHAPE_ICONS, SKETCH_TOOL_ICONS } from './icons';

const TRANSFORM_TOOLS: { tool: TransformTool; label: string; icon: typeof Move3d; key: string }[] = [
  { tool: 'select', label: 'Select', icon: MousePointer2, key: 'V' },
  { tool: 'translate', label: 'Move', icon: Move3d, key: 'M' },
  { tool: 'rotate', label: 'Rotate', icon: Rotate3d, key: 'R' },
  { tool: 'scale', label: 'Scale', icon: Scale3d, key: 'S' },
];

const SKETCH_TOOLS: { tool: SketchTool; label: string; key: string }[] = [
  { tool: 'select', label: 'Select', key: 'V' },
  { tool: 'line', label: 'Line', key: 'L' },
  { tool: 'rect', label: 'Rectangle', key: 'R' },
  { tool: 'circle', label: 'Circle', key: 'C' },
  { tool: 'arc', label: 'Arc', key: 'A' },
  { tool: 'polygon', label: 'Polygon', key: 'P' },
];

const SKETCH_HINTS: Record<SketchTool, string[]> = {
  select: ['Click a curve to select it and edit its dimensions.'],
  line: ['Click to set the start point.', 'Click to add the next point. Click the start point to close, Esc to stop.'],
  rect: ['Click the first corner.', 'Click the opposite corner.'],
  circle: ['Click the center.', 'Click to set the radius.'],
  arc: ['Click the center.', 'Click the start point.', 'Click the end point (counter-clockwise).'],
  polygon: ['Click the center.', 'Click to set the radius and rotation.'],
};

function useHint(): string {
  const mode = useCad((s) => s.mode);
  const sketchTool = useCad((s) => s.sketchTool);
  const draftLen = useCad((s) => s.draft?.points.length ?? 0);
  const transformTool = useCad((s) => s.transformTool);
  const hasSelection = useCad((s) => s.selectedId !== null);

  if (mode === 'pickPlane') return 'Choose a plane for the new sketch.';
  if (mode === 'extrude') return 'Enter the extrusion distance, then press OK.';
  if (mode === 'sketch') {
    const hints = SKETCH_HINTS[sketchTool];
    return hints[Math.min(draftLen, hints.length - 1)];
  }
  if (transformTool !== 'select' && !hasSelection) return 'Select an object to transform it.';
  if (transformTool !== 'select') return 'Drag the gizmo handles to transform the selected object.';
  return 'Left click: select · Right drag: orbit · Middle drag: pan · Wheel: zoom';
}

function SketchToolbar() {
  const tool = useCad((s) => s.sketchTool);
  const sides = useCad((s) => s.polygonSides);
  const showDimensions = useCad((s) => s.showDimensions);
  const extrudable = useCad((s) => s.findExtrudableSketch());
  const { setSketchTool, setPolygonSides, toggleDimensions, finishSketch, startExtrude } = useCad.getState();

  return (
    <>
      {SKETCH_TOOLS.map((t) => (
        <ToolButton
          key={t.tool}
          icon={SKETCH_TOOL_ICONS[t.tool]}
          label={t.label}
          shortcut={t.key}
          active={tool === t.tool}
          onClick={() => setSketchTool(t.tool)}
        />
      ))}
      {tool === 'polygon' && (
        <label className="ml-1 flex items-center gap-1 text-[12px] text-muted">
          Sides
          <input
            type="number"
            min={3}
            max={64}
            value={sides}
            onChange={(e) => setPolygonSides(Number(e.target.value) || 3)}
            className="w-12 rounded border border-line bg-panel-2 px-1 py-0.5 text-text outline-none focus:border-accent"
          />
        </label>
      )}
      <Divider />
      <ToolButton icon={Ruler} label="Dimensions" active={showDimensions} onClick={toggleDimensions} title="Show or hide dimension labels" />
      <Divider />
      <ToolButton icon={Check} label="Finish Sketch" onClick={finishSketch} />
      <ToolButton icon={ArrowUpFromLine} label="Extrude" variant="primary" onClick={() => startExtrude()} disabled={!extrudable} title={extrudable ? 'Finish and extrude' : 'Draw a closed profile first'} />
    </>
  );
}

function ModelToolbar() {
  const tool = useCad((s) => s.transformTool);
  const selectedId = useCad((s) => s.selectedId);
  const mode = useCad((s) => s.mode);
  const extrudable = useCad((s) => s.findExtrudableSketch());
  const { setTransformTool, startNewSketch, addPrimitive, startExtrude, duplicateObject, deleteObject, openSubwoofer } = useCad.getState();
  const disabled = mode !== 'model';

  return (
    <>
      {TRANSFORM_TOOLS.map((t) => (
        <ToolButton
          key={t.tool}
          icon={t.icon}
          label={t.label}
          shortcut={t.key}
          active={tool === t.tool}
          disabled={disabled}
          onClick={() => setTransformTool(t.tool)}
        />
      ))}
      <Divider />
      <ToolButton icon={PencilRuler} label="Sketch" onClick={startNewSketch} disabled={disabled} title="New sketch" />
      {PRIMITIVE_SHAPES.map((shape) => (
        <ToolButton
          key={shape}
          icon={SHAPE_ICONS[shape]}
          label={PRIMITIVES[shape].label}
          onClick={() => addPrimitive(shape)}
          disabled={disabled}
          title={`Add ${PRIMITIVES[shape].label}`}
        />
      ))}
      <ToolButton icon={ArrowUpFromLine} label="Extrude" onClick={() => startExtrude()} disabled={disabled || !extrudable} title={extrudable ? `Extrude ${extrudable.name}` : 'Draw a closed sketch profile first'} />
      <Divider />
      <ToolButton
        icon={Speaker}
        label="Sub Box"
        variant="primary"
        disabled={disabled}
        onClick={openSubwoofer}
        title="Design a subwoofer box from your subwoofer's data"
      />
      <Divider />
      <ToolButton
        icon={Copy}
        label="Duplicate"
        compact
        shortcut="Ctrl+D"
        disabled={disabled || !selectedId}
        onClick={() => selectedId && duplicateObject(selectedId)}
      />
      <ToolButton
        icon={Trash2}
        label="Delete"
        compact
        shortcut="Del"
        disabled={disabled || !selectedId}
        onClick={() => selectedId && deleteObject(selectedId)}
      />
    </>
  );
}

export function BottomToolbar() {
  const mode = useCad((s) => s.mode);
  const cursor = useCad((s) => s.cursor);
  const units = useCad((s) => s.units);
  const hint = useHint();

  return (
    <footer className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-t border-line bg-panel px-2">
      {mode === 'sketch' ? <SketchToolbar /> : <ModelToolbar />}
      <div className="flex-1" />
      <span className="ml-3 truncate text-[11px] text-muted">{hint}</span>
      {mode === 'sketch' && cursor && (
        <span className="ml-3 whitespace-nowrap font-mono text-[11px] text-sky-300">
          {formatLength(cursor[0], units)}, {formatLength(cursor[1], units)}
        </span>
      )}
    </footer>
  );
}
