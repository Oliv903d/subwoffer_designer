import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoxFace, DriverMount, DriverSpec, EnclosureObject, Vec2 } from '../types/cad';
import { useCad } from '../store/cadStore';
import {
  analyze,
  BOX_FACES,
  baffleNormal,
  baffleToLocal,
  faceFrame,
  facePolygon,
  faceToLocal,
  insidePolygon,
  localToFace,
  outerProfile,
  PORT_WALL,
} from '../subwoofer/enclosure';
import { FACE_DIM, FACE_LABEL, faceAxis, faceInfo, type Face } from '../subwoofer/faces';
import { formatLength } from '../utils/units';
import { formatVolume } from '../subwoofer/format';

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** A simple subwoofer model facing +Z with its mounting face at z = 0. */
function DriverModel({ spec }: { spec: DriverSpec }) {
  const rf = spec.outerDiameter / 2;
  const rc = spec.cutoutDiameter / 2;
  const coneDepth = Math.min(spec.mountingDepth * 0.35, rc * 0.5);

  const flange = useMemo(() => {
    const shape = new THREE.Shape().absarc(0, 0, rf, 0, Math.PI * 2, false);
    shape.holes.push(new THREE.Path().absarc(0, 0, rc * 0.93, 0, Math.PI * 2, true));
    return new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false, curveSegments: 64 });
  }, [rf, rc]);
  const cone = useMemo(
    () =>
      new THREE.LatheGeometry(
        [new THREE.Vector2(rc * 0.28, -coneDepth), new THREE.Vector2(rc * 0.8, 0)],
        64,
      ).rotateX(Math.PI / 2),
    [rc, coneDepth],
  );

  return (
    <group>
      <mesh geometry={flange} castShadow>
        <meshStandardMaterial color="#2a2d33" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 3]}>
        <torusGeometry args={[rc * 0.86, rc * 0.07, 16, 64]} />
        <meshStandardMaterial color="#141414" roughness={0.9} />
      </mesh>
      <mesh geometry={cone}>
        <meshStandardMaterial color="#1b1c1f" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, -coneDepth]} scale={[1, 1, 0.45]} rotation={[Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[rc * 0.3, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#26282c" roughness={0.5} />
      </mesh>
    </group>
  );
}

interface DragState {
  kind: 'driver' | 'port';
  index: number;
  /** Side the item is currently on; changes when a subwoofer is dragged over an edge. */
  face: BoxFace;
  grab: Vec2;
}

/** Parameter along the line (origin + t·dir) closest to the ray; null when looking along the line. */
function axisParam(ray: THREE.Ray, origin: THREE.Vector3, dir: THREE.Vector3): number | null {
  const w0 = ray.origin.clone().sub(origin);
  const b = ray.direction.dot(dir);
  const denom = 1 - b * b;
  if (denom < 1e-4) return null;
  return (dir.dot(w0) - b * ray.direction.dot(w0)) / denom;
}

type GroupRef = RefObject<THREE.Group | null>;

function worldAxis(g: THREE.Group, point: [number, number, number], dir: THREE.Vector3) {
  return {
    origin: new THREE.Vector3(...point).applyMatrix4(g.matrixWorld),
    dir: dir.clone().transformDirection(g.matrixWorld),
  };
}

function Label({ pos, children, tone = 'text-sky-200' }: { pos: [number, number, number]; children: ReactNode; tone?: string }) {
  return (
    <Html position={pos} center zIndexRange={[25, 10]} style={{ pointerEvents: 'none' }}>
      <div className={`whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-center font-mono text-[11px] ${tone}`}>{children}</div>
    </Html>
  );
}

/** Highlights the selected side, shows its cut size and lets you drag it to resize the box. */
function FaceOverlay({ obj, face, groupRef }: { obj: EnclosureObject; face: Face; groupRef: GroupRef }) {
  const units = useCad((s) => s.units);
  const resizeFace = useCad((s) => s.resizeFace);
  const endCoalesce = useCad((s) => s.endCoalesce);
  const info = faceInfo(obj, face);
  const drag = useRef<{ start: EnclosureObject; t0: number; origin: THREE.Vector3; dir: THREE.Vector3 } | null>(null);
  const cornersKey = JSON.stringify(info.corners);

  const geometry = useMemo(() => {
    const off = faceAxis(face).multiplyScalar(0.8);
    const p = info.corners.map((c) => new THREE.Vector3(...c).add(off));
    return new THREE.BufferGeometry().setFromPoints([p[0], p[1], p[2], p[0], p[2], p[3]]);
  }, [cornersKey, face]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const axis = faceAxis(face);
  const arrowPos = new THREE.Vector3(...info.center).addScaledVector(axis, 30);
  const arrowQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const dim = FACE_DIM[face];

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0 || !groupRef.current) return;
    e.stopPropagation();
    const { origin, dir } = worldAxis(groupRef.current, info.center, axis);
    const t0 = axisParam(e.ray, origin, dir);
    if (t0 === null) return;
    drag.current = { start: obj, t0, origin, dir };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const t = axisParam(e.ray, d.origin, d.dir);
    if (t === null) return;
    resizeFace(obj.id, face, Math.round(d.start.shape[dim] + t - d.t0), d.start, `${obj.id}:face`);
  };
  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    drag.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
    endCoalesce();
  };
  const events = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onClick: (e: ThreeEvent<MouseEvent>) => e.stopPropagation(),
    onPointerOver: () => (document.body.style.cursor = 'move'),
    onPointerOut: () => (document.body.style.cursor = ''),
  };

  return (
    <>
      <mesh geometry={geometry} renderOrder={5} {...events}>
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={arrowPos} quaternion={arrowQuat} {...events}>
        <coneGeometry args={[12, 30, 24]} />
        <meshStandardMaterial color="#f59e0b" emissive="#7c4a03" />
      </mesh>
      <Label pos={info.center} tone="text-amber-200">
        <div className="font-sans font-semibold">{FACE_LABEL[face]} panel</div>
        <div>
          cut {formatLength(info.panel.a, units)} × {formatLength(info.panel.b, units)}
          {info.panel.qty > 1 ? ` (×${info.panel.qty})` : ''}
        </div>
        <div className="text-[10px] text-muted">drag to resize</div>
      </Label>
      <Label pos={info.labelA}>{formatLength(info.panel.a, units)}</Label>
      <Label pos={info.labelB}>{formatLength(info.panel.b, units)}</Label>
    </>
  );
}

/** Drag the top edge of the angled panel forwards/backwards to change its angle. */
function AngleHandle({ obj, groupRef }: { obj: EnclosureObject; groupRef: GroupRef }) {
  const updateEnclosure = useCad((s) => s.updateEnclosure);
  const endCoalesce = useCad((s) => s.endCoalesce);
  const drag = useRef<{ start: EnclosureObject; t0: number; z0: number; origin: THREE.Vector3; dir: THREE.Vector3 } | null>(null);
  const s = obj.shape;
  const [, , p2, p3] = outerProfile(s);
  const front = s.slant === 'front';
  const pos: [number, number, number] = [0, s.height, front ? p2.z : p3.z];

  return (
    <>
      <mesh
        position={pos}
        onPointerDown={(e) => {
          if (e.nativeEvent.button !== 0 || !groupRef.current) return;
          e.stopPropagation();
          const { origin, dir } = worldAxis(groupRef.current, pos, new THREE.Vector3(0, 0, 1));
          const t0 = axisParam(e.ray, origin, dir);
          if (t0 === null) return;
          drag.current = { start: obj, t0, z0: pos[2], origin, dir };
          (e.target as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          e.stopPropagation();
          const t = axisParam(e.ray, d.origin, d.dir);
          if (t === null) return;
          const z = d.z0 + t - d.t0;
          const { depth: D, height: H } = d.start.shape;
          const tan = front ? (D / 2 - z) / H : (z + D / 2) / H;
          const angle = Math.round(THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.atan(tan)), 0, 60) * 2) / 2;
          updateEnclosure(
            obj.id,
            (o) => ({ ...o, shape: { ...o.shape, slantAngle: angle }, design: { ...o.design, autoShape: false } }),
            null,
            `${obj.id}:angle`,
          );
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          drag.current = null;
          (e.target as Element).releasePointerCapture(e.pointerId);
          endCoalesce();
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerOver={() => (document.body.style.cursor = 'ew-resize')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <sphereGeometry args={[11, 24, 16]} />
        <meshStandardMaterial color="#f59e0b" emissive="#7c4a03" />
      </mesh>
      <Label pos={[pos[0], pos[1] + 28, pos[2]]} tone="text-amber-200">
        {s.slantAngle}° ↔ drag
      </Label>
    </>
  );
}

/** Subwoofers, draggable port rings and size labels, drawn in the enclosure's local space. */
export function EnclosureParts({ obj, selected, interactive }: { obj: EnclosureObject; selected: boolean; interactive: boolean }) {
  const units = useCad((s) => s.units);
  const updateEnclosure = useCad((s) => s.updateEnclosure);
  const select = useCad((s) => s.select);
  const endCoalesce = useCad((s) => s.endCoalesce);
  const groupRef = useRef<THREE.Group>(null);
  const drag = useRef<DragState | null>(null);
  const face = useCad((st) => (selected ? st.selectedFace : null));
  const s = obj.shape;

  const quaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(Z_AXIS, new THREE.Vector3(...baffleNormal(s))),
    [s],
  );
  const analysis = useMemo(() => (selected ? analyze(obj) : null), [obj, selected]);

  const localRay = (e: ThreeEvent<PointerEvent>): THREE.Ray | null => {
    const g = groupRef.current;
    return g ? e.ray.clone().applyMatrix4(g.matrixWorld.clone().invert()) : null;
  };

  /** Where the pointer is on the plane of `side` (even beyond its edges). */
  const onSidePlane = (e: ThreeEvent<PointerEvent>, side: BoxFace): Vec2 | null => {
    const ray = localRay(e);
    if (!ray) return null;
    const f = faceFrame(s, side);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...f.n), new THREE.Vector3(...f.origin));
    const hit = ray.intersectPlane(plane, new THREE.Vector3());
    return hit ? localToFace(s, side, [hit.x, hit.y, hit.z]) : null;
  };

  /** The side of the box under the pointer, if any. */
  const sideUnderPointer = (e: ThreeEvent<PointerEvent>): DriverMount | null => {
    const ray = localRay(e);
    if (!ray) return null;
    let best: { m: DriverMount; dist: number } | null = null;
    for (const side of BOX_FACES) {
      const f = faceFrame(s, side);
      const n = new THREE.Vector3(...f.n);
      if (ray.direction.dot(n) >= 0) continue;
      const hit = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(...f.origin)), new THREE.Vector3());
      if (!hit) continue;
      const p = localToFace(s, side, [hit.x, hit.y, hit.z]);
      if (!insidePolygon(facePolygon(s, side), p)) continue;
      const dist = hit.distanceTo(ray.origin);
      if (!best || dist < best.dist) best = { m: { face: side, p }, dist };
    }
    return best?.m ?? null;
  };

  const handlers = (kind: DragState['kind'], index: number, current: Vec2, side: BoxFace) =>
    interactive
      ? {
          onPointerDown: (e: ThreeEvent<PointerEvent>) => {
            if (e.nativeEvent.button !== 0) return;
            e.stopPropagation();
            select(obj.id);
            const p = onSidePlane(e, side);
            if (!p) return;
            drag.current = { kind, index, face: side, grab: [p[0] - current[0], p[1] - current[1]] };
            (e.target as Element).setPointerCapture(e.pointerId);
          },
          onPointerMove: (e: ThreeEvent<PointerEvent>) => {
            const d = drag.current;
            if (!d) return;
            e.stopPropagation();
            let next: Vec2 | null = null;
            if (d.kind === 'driver') {
              const under = sideUnderPointer(e);
              if (under && under.face !== d.face) {
                d.face = under.face;
                d.grab = [0, 0];
                next = under.p;
              }
            }
            if (!next) {
              const p = onSidePlane(e, d.face);
              if (!p) return;
              next = [p[0] - d.grab[0], p[1] - d.grab[1]];
            }
            const at = next;
            updateEnclosure(
              obj.id,
              (o) =>
                d.kind === 'driver'
                  ? { ...o, drivers: o.drivers.map((m, i) => (i === d.index ? { face: d.face, p: at } : m)) }
                  : { ...o, port: { ...o.port, positions: o.port.positions.map((q, i) => (i === d.index ? at : q)) } },
              null,
              `${obj.id}:drag`,
            );
          },
          onPointerUp: (e: ThreeEvent<PointerEvent>) => {
            if (!drag.current) return;
            drag.current = null;
            (e.target as Element).releasePointerCapture(e.pointerId);
            endCoalesce();
          },
          onPointerOver: () => (document.body.style.cursor = 'grab'),
          onPointerOut: () => (document.body.style.cursor = ''),
          onClick: (e: ThreeEvent<MouseEvent>) => e.stopPropagation(),
        }
      : {};

  const label = (text: string, pos: [number, number, number], color = 'text-sky-200') => (
    <Html position={pos} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <div className={`whitespace-nowrap rounded bg-black/70 px-1.5 py-px font-mono text-[11px] ${color}`}>{text}</div>
    </Html>
  );

  const ported = obj.design.boxType === 'ported';
  const err = analysis?.volumeError ?? null;

  return (
    <group ref={groupRef}>
      {obj.drivers.map((m, i) => (
        <group
          key={`d${i}`}
          position={faceToLocal(s, m.face, m.p)}
          quaternion={new THREE.Quaternion().setFromUnitVectors(Z_AXIS, new THREE.Vector3(...faceFrame(s, m.face).n))}
          {...handlers('driver', i, m.p, m.face)}
        >
          <DriverModel spec={obj.driver} />
        </group>
      ))}
      {ported &&
        obj.port.shape === 'round' &&
        obj.port.positions.map((p, i) => (
          <mesh key={`p${i}`} position={baffleToLocal(s, p)} quaternion={quaternion} {...handlers('port', i, p, 'front')}>
            <torusGeometry args={[obj.port.diameter / 2 + PORT_WALL, 4, 12, 48]} />
            <meshStandardMaterial color="#202226" roughness={0.6} />
          </mesh>
        ))}
      {selected && face && interactive && <FaceOverlay obj={obj} face={face} groupRef={groupRef} />}
      {selected && interactive && s.slant !== 'none' && <AngleHandle obj={obj} groupRef={groupRef} />}
      {selected && analysis && (
        <>
          {!face && label(`W ${formatLength(s.width, units)}`, [0, -12, s.depth / 2 + 12])}
          {!face && label(`H ${formatLength(s.height, units)}`, [s.width / 2 + 12, s.height / 2, s.depth / 2])}
          {!face && label(`D ${formatLength(s.depth, units)}`, [s.width / 2 + 12, -12, 0])}
          {label(
            `Net ${formatVolume(analysis.volumes.net, units)}${
              analysis.targets.vb ? ` / target ${formatVolume(analysis.targets.vb, units)}` : ''
            }`,
            [0, s.height + 70, 0],
            err === null ? 'text-sky-200' : Math.abs(err) <= 0.05 ? 'text-emerald-300' : 'text-amber-300',
          )}
        </>
      )}
    </group>
  );
}
