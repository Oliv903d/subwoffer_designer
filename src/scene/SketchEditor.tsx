import { useMemo, useRef, useState } from 'react';
import { Html, Line } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { SketchEntity, SketchObject, Vec2, Vec3 } from '../types/cad';
import { planeOrigin, planeQuaternion } from '../geometry/planes';
import { useCad, type Draft, type SketchTool } from '../store/cadStore';
import {
  arcSweep,
  dist,
  entityPolyline,
  entitySnapPoints,
  hitTestEntities,
  normalizeRect,
  samePoint,
} from '../sketch/entities';
import { createId } from '../utils/id';
import { formatLength, niceStep, round, UNIT_FACTOR } from '../utils/units';
import { DimensionLabels } from './DimensionLabels';
import { CadGrid } from './SceneEnvironment';

const PREVIEW_COLOR = '#ffb454';

interface Hover {
  p: Vec2;
  raw: Vec2;
  snapped: boolean;
}

/** Builds the entity that the current tool would create for the given draft and cursor point. */
function previewEntity(tool: SketchTool, draft: Draft, p: Vec2, sides: number): SketchEntity | null {
  const [a, b] = draft.points;
  const id = createId();
  switch (tool) {
    case 'line':
      return dist(a, p) > 0 ? { id, type: 'line', a, b: p } : null;
    case 'rect': {
      const r = normalizeRect(a[0], a[1], p[0], p[1]);
      return r.w > 0 && r.h > 0 ? { id, type: 'rect', ...r } : null;
    }
    case 'circle':
      return dist(a, p) > 0 ? { id, type: 'circle', c: a, r: dist(a, p) } : null;
    case 'polygon':
      return dist(a, p) > 0
        ? { id, type: 'polygon', c: a, r: dist(a, p), sides, angle: Math.atan2(p[1] - a[1], p[0] - a[0]) }
        : null;
    case 'arc': {
      if (!b) return dist(a, p) > 0 ? { id, type: 'line', a, b: p } : null;
      const start = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const end = Math.atan2(p[1] - a[1], p[0] - a[0]);
      return Math.abs(end - start) > 1e-6 ? { id, type: 'arc', c: a, r: dist(a, b), start, end } : null;
    }
    default:
      return null;
  }
}

function previewText(e: SketchEntity, units: Parameters<typeof formatLength>[1]): string {
  switch (e.type) {
    case 'line': {
      const ang = (Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]) * 180) / Math.PI;
      return `${formatLength(dist(e.a, e.b), units)}  ${round(ang, 1)}°`;
    }
    case 'rect':
      return `${formatLength(e.w, units)} × ${formatLength(e.h, units)}`;
    case 'circle':
      return `Ø ${formatLength(e.r * 2, units)}`;
    case 'arc':
      return `R ${formatLength(e.r, units)}  ${round((arcSweep(e) * 180) / Math.PI, 1)}°`;
    case 'polygon':
      return `R ${formatLength(e.r, units)}  ${e.sides} sides`;
  }
}

/** Interactive drawing surface for the active sketch. */
export function SketchEditor({ sketch }: { sketch: SketchObject }) {
  const groupRef = useRef<THREE.Group>(null);
  const markerRef = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);

  const tool = useCad((s) => s.sketchTool);
  const draft = useCad((s) => s.draft);
  const units = useCad((s) => s.units);
  const sides = useCad((s) => s.polygonSides);
  const showDimensions = useCad((s) => s.showDimensions);
  const setDraft = useCad((s) => s.setDraft);
  const setCursor = useCad((s) => s.setCursor);
  const addEntity = useCad((s) => s.addEntity);
  const selectEntity = useCad((s) => s.selectEntity);
  const [hover, setHover] = useState<Hover | null>(null);

  const quaternion = useMemo(() => planeQuaternion(sketch.plane), [sketch.plane]);
  const position = planeOrigin(sketch.plane, sketch.offset);

  const pixelSize = () => 1 / ((camera as THREE.OrthographicCamera).zoom || 1);

  // Keep the cursor marker a constant size on screen.
  useFrame(() => {
    markerRef.current?.scale.setScalar(pixelSize());
  });

  const snapPoints = useMemo<Vec2[]>(
    () => [[0, 0], ...sketch.entities.flatMap(entitySnapPoints), ...(draft?.points ?? [])],
    [sketch.entities, draft],
  );

  const resolve = (e: ThreeEvent<PointerEvent>): Hover | null => {
    const g = groupRef.current;
    if (!g) return null;
    const local = g.worldToLocal(e.point.clone());
    const raw: Vec2 = [local.x, local.y];
    const px = pixelSize();
    let best: Vec2 | null = null;
    let bestD = 10 * px;
    for (const s of snapPoints) {
      const d = dist(s, raw);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best) return { p: best, raw, snapped: true };
    const f = UNIT_FACTOR[units];
    const step = niceStep((8 * px) / f) * f;
    return { p: [round(Math.round(raw[0] / step) * step, 6), round(Math.round(raw[1] / step) * step, 6)], raw, snapped: false };
  };

  const place = (h: Hover) => {
    const p = h.p;
    if (tool === 'select') {
      selectEntity(hitTestEntities(sketch.entities, h.raw, 8 * pixelSize())?.id ?? null);
      return;
    }
    if (!draft) {
      setDraft({ points: [p], chainStart: tool === 'line' ? p : null });
      return;
    }
    if (tool === 'arc' && draft.points.length === 1) {
      if (dist(draft.points[0], p) > 0) setDraft({ ...draft, points: [draft.points[0], p] });
      return;
    }
    const entity = previewEntity(tool, draft, p, sides);
    if (!entity) return;
    addEntity(entity);
    if (tool === 'line' && !(draft.chainStart && samePoint(p, draft.chainStart))) {
      setDraft({ points: [p], chainStart: draft.chainStart });
    } else {
      setDraft(null);
    }
  };

  const preview = draft && hover ? previewEntity(tool, draft, hover.p, sides) : null;

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.05]}>
        <CadGrid />
      </group>

      <mesh
        onPointerMove={(e) => {
          const h = resolve(e);
          setHover(h);
          setCursor(h?.p ?? null);
        }}
        onPointerLeave={() => {
          setHover(null);
          setCursor(null);
        }}
        onPointerDown={(e) => {
          if (e.nativeEvent.button !== 0) return;
          e.stopPropagation();
          const h = resolve(e);
          if (h) place(h);
        }}
      >
        <planeGeometry args={[1e6, 1e6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {preview && (
        <Line
          points={entityPolyline(preview).map((q): Vec3 => [q[0], q[1], 0.05])}
          color={PREVIEW_COLOR}
          lineWidth={1.5}
          dashed
          dashSize={3 * pixelSize()}
          gapSize={3 * pixelSize()}
          depthTest={false}
        />
      )}

      {preview && hover && (
        <Html position={[hover.p[0], hover.p[1], 0]} zIndexRange={[40, 30]} style={{ pointerEvents: 'none' }}>
          <div className="ml-4 mt-3 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-amber-200">
            {previewText(preview, units)}
          </div>
        </Html>
      )}

      {hover && tool !== 'select' && (
        <group ref={markerRef} position={[hover.p[0], hover.p[1], 0.1]}>
          <mesh renderOrder={10}>
            <ringGeometry args={[3, 4.5, 20]} />
            <meshBasicMaterial color={hover.snapped ? '#4ade80' : '#e6edf7'} depthTest={false} />
          </mesh>
        </group>
      )}

      {showDimensions && <DimensionLabels entities={sketch.entities} />}
    </group>
  );
}
