import * as THREE from 'three';
import type { SketchPlane, Vec3 } from '../types/cad';

interface PlaneBasis {
  u: THREE.Vector3;
  v: THREE.Vector3;
  n: THREE.Vector3;
}

/** Right-handed (u, v, n) frames for each sketch plane in the Y-up world. */
const BASES: Record<SketchPlane, PlaneBasis> = {
  XY: { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, 1) },
  XZ: { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1), n: new THREE.Vector3(0, 1, 0) },
  YZ: { u: new THREE.Vector3(0, 0, -1), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(1, 0, 0) },
};

export const PLANE_COLORS: Record<SketchPlane, string> = {
  XY: '#3e63dd',
  XZ: '#46a758',
  YZ: '#e5484d',
};

export function planeBasis(plane: SketchPlane): PlaneBasis {
  const b = BASES[plane];
  return { u: b.u.clone(), v: b.v.clone(), n: b.n.clone() };
}

export function planeMatrix(plane: SketchPlane, offset: number): THREE.Matrix4 {
  const { u, v, n } = BASES[plane];
  return new THREE.Matrix4().makeBasis(u, v, n).setPosition(n.clone().multiplyScalar(offset));
}

export function planeQuaternion(plane: SketchPlane): THREE.Quaternion {
  return new THREE.Quaternion().setFromRotationMatrix(planeMatrix(plane, 0));
}

export function planeOrigin(plane: SketchPlane, offset: number): Vec3 {
  const n = BASES[plane].n;
  return [n.x * offset, n.y * offset, n.z * offset];
}
