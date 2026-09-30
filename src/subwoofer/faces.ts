import * as THREE from 'three';
import type { BoxFace, EnclosureDim, EnclosureObject, Vec3 } from '../types/cad';
import { cutList, finalizeEnclosure, outerProfile, type CutPanel } from './enclosure';

export type Face = BoxFace;

export const FACE_LABEL: Record<Face, string> = {
  top: 'Top',
  bottom: 'Bottom',
  front: 'Front (subwoofer side)',
  back: 'Back',
  left: 'Left side',
  right: 'Right side',
};

const FACE_PANEL: Record<Face, string> = {
  top: 'Top',
  bottom: 'Bottom',
  front: 'Front (baffle)',
  back: 'Back',
  left: 'Side',
  right: 'Side',
};

/** The size a face changes when it is dragged. */
export const FACE_DIM: Record<Face, EnclosureDim> = {
  top: 'height',
  bottom: 'height',
  front: 'depth',
  back: 'depth',
  left: 'width',
  right: 'width',
};

/** Outward drag direction in box-local space (slanted panels are dragged horizontally). */
const FACE_AXIS: Record<Face, Vec3> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
};

/** How far the box origin moves per mm of growth (origin is bottom-centre). */
const FACE_SHIFT: Record<Face, number> = { top: 0, bottom: 1, front: 0.5, back: 0.5, left: 0.5, right: 0.5 };

export function faceAxis(face: Face): THREE.Vector3 {
  return new THREE.Vector3(...FACE_AXIS[face]);
}

/** Picks the box side from a local surface normal. */
export function faceFromNormal(n: { x: number; y: number; z: number }): Face {
  if (Math.abs(n.x) > 0.7) return n.x > 0 ? 'right' : 'left';
  if (n.y > 0.95) return 'top';
  if (n.y < -0.95) return 'bottom';
  return n.z > 0 ? 'front' : 'back';
}

export interface FaceInfo {
  corners: Vec3[];
  center: Vec3;
  panel: CutPanel;
  /** Where to show the panel's two cut sizes (a, b). */
  labelA: Vec3;
  labelB: Vec3;
}

export function faceInfo(o: EnclosureObject, face: Face): FaceInfo {
  const s = o.shape;
  const hw = s.width / 2;
  const [p0, p1, p2, p3] = outerProfile(s);
  const at = (x: number, p: { z: number; y: number }): Vec3 => [x, p.y, p.z];
  const corners: Record<Face, Vec3[]> = {
    left: [at(-hw, p0), at(-hw, p1), at(-hw, p2), at(-hw, p3)],
    right: [at(hw, p0), at(hw, p1), at(hw, p2), at(hw, p3)],
    bottom: [at(-hw, p0), at(hw, p0), at(hw, p1), at(-hw, p1)],
    top: [at(-hw, p3), at(hw, p3), at(hw, p2), at(-hw, p2)],
    front: [at(-hw, p1), at(hw, p1), at(hw, p2), at(-hw, p2)],
    back: [at(-hw, p0), at(hw, p0), at(hw, p3), at(-hw, p3)],
  };
  const c = corners[face];
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const center = mid(mid(c[0], c[2]), mid(c[1], c[3]));
  const panel = cutList(o).find((p) => p.name === FACE_PANEL[face])!;
  const side = face === 'left' || face === 'right';
  return {
    corners: c,
    center,
    panel,
    labelA: side ? mid(c[1], c[2]) : mid(c[0], c[1]),
    labelB: side ? mid(c[0], c[1]) : mid(c[1], c[2]),
  };
}

/**
 * Resizes the box by moving one side to `value` (the new size of that dimension),
 * keeping the opposite side where it was.
 */
export function resizeFromFace(start: EnclosureObject, face: Face, value: number): EnclosureObject {
  const dim = FACE_DIM[face];
  const next = finalizeEnclosure(
    { ...start, shape: { ...start.shape, [dim]: value }, design: { ...start.design, autoShape: false } },
    dim,
    start,
  );
  const grown = next.shape[dim] - start.shape[dim];
  const [rx, ry, rz] = start.transform.rotation.map(THREE.MathUtils.degToRad);
  const shift = faceAxis(face).multiplyScalar(grown * FACE_SHIFT[face]).applyEuler(new THREE.Euler(rx, ry, rz));
  const [x, y, z] = start.transform.position;
  return {
    ...next,
    transform: { ...next.transform, position: [x + shift.x, y + shift.y, z + shift.z] },
  };
}
