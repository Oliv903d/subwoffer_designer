import * as THREE from 'three';
import { ADDITION, Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { EnclosureObject } from '../types/cad';
import {
  baffleNormal,
  baffleToLocal,
  faceFrame,
  faceToLocal,
  innerWidth,
  insetPolygon,
  isPorted,
  outerProfile,
  PORT_WALL,
  slotPath,
  zBackInner,
  type ZY,
} from './enclosure';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal'];
evaluator.useGroups = false;

/** Extrudes a side profile (z, y) across the width (X), centred on x = 0. */
function prism(profile: ZY[], width: number): THREE.BufferGeometry {
  // After rotateY(90°): shape x → -Z and extrusion z → X, so feed x = -z.
  const shape = new THREE.Shape(profile.map((p) => new THREE.Vector2(-p.z, p.y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

function boxBrush(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Brush {
  const b = new Brush(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0));
  b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  b.updateMatrixWorld();
  return b;
}

/** Cylinder along the baffle normal; `offset` moves its centre along the normal. */
function normalCylinder(
  o: EnclosureObject,
  at: [number, number, number],
  radius: number,
  length: number,
  offset: number,
  normal: [number, number, number] = baffleNormal(o.shape),
): Brush {
  const n = new THREE.Vector3(...normal);
  const b = new Brush(new THREE.CylinderGeometry(radius, radius, length, 48));
  b.quaternion.setFromUnitVectors(Y_AXIS, n);
  b.position.set(...at).addScaledVector(n, offset);
  b.updateMatrixWorld();
  return b;
}

/** Clean outer edges of the box (CSG output has many internal edges). */
export function buildEnclosureOutline(o: EnclosureObject): THREE.BufferGeometry {
  const prismGeo = prism(outerProfile(o.shape), o.shape.width);
  const edges = new THREE.EdgesGeometry(prismGeo, 20);
  prismGeo.dispose();
  return edges;
}

/** Builds the box shell with real cutouts and port parts using CSG. */
export function buildEnclosureGeometry(o: EnclosureObject): THREE.BufferGeometry {
  const s = o.shape;
  const t = s.thickness;
  const wi = innerWidth(s);

  const outer = new Brush(prism(outerProfile(s), s.width));
  const inner = new Brush(prism(insetPolygon(outerProfile(s), t), wi));
  outer.updateMatrixWorld();
  inner.updateMatrixWorld();
  let result = evaluator.evaluate(outer, inner, SUBTRACTION);

  for (const m of o.drivers) {
    const at = faceToLocal(s, m.face, m.p);
    const cut = normalCylinder(o, at, o.driver.cutoutDiameter / 2, t * 4, 0, faceFrame(s, m.face).n);
    result = evaluator.evaluate(result, cut, SUBTRACTION);
  }

  if (isPorted(o) && o.port.shape === 'slot') {
    const h = o.port.slotHeight;
    const path = slotPath(o, o.port.length);
    const e = 0.05;
    // Opening through the baffle, then the shelf (slightly wider so it overlaps the side walls).
    result = evaluator.evaluate(result, boxBrush(-wi / 2 + e, wi / 2 - e, t + e, t + h, 0, s.depth / 2 + 10), SUBTRACTION);
    const xw = wi / 2 + 0.5;
    if (path.shelfZ1 - path.shelfZ0 > 1) {
      result = evaluator.evaluate(result, boxBrush(-xw, xw, t + h, t + h + t, path.shelfZ0, path.shelfZ1), ADDITION);
    }
    if (path.folded) {
      const z = zBackInner(s, t) + h;
      result = evaluator.evaluate(result, boxBrush(-xw, xw, t + h, path.wallTop, z, z + t), ADDITION);
    }
  }

  if (isPorted(o) && o.port.shape === 'round') {
    const r = o.port.diameter / 2;
    const L = o.port.length;
    for (const p of o.port.positions) {
      const at = baffleToLocal(s, p);
      result = evaluator.evaluate(result, normalCylinder(o, at, r + PORT_WALL, t * 4, 0), SUBTRACTION);
      const tube = evaluator.evaluate(
        normalCylinder(o, at, r + PORT_WALL, L, -L / 2),
        normalCylinder(o, at, r, L + 2, -L / 2),
        SUBTRACTION,
      );
      result = evaluator.evaluate(result, tube, ADDITION);
    }
  }

  const geo = result.geometry;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
