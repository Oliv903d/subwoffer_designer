import * as THREE from 'three';
import type { SketchEntity, Vec2 } from '../types/cad';
import { arcPoint, arcSweep, pointKey, polygonVertices, rectCorners, sampleArc, TAU } from './entities';

interface ChainEdge {
  start: Vec2;
  end: Vec2;
  /** Points from start (inclusive) to end (exclusive). */
  forward: Vec2[];
  /** Points from end (inclusive) to start (exclusive). */
  backward: Vec2[];
}

function toChainEdge(e: SketchEntity): ChainEdge | null {
  if (e.type === 'line') {
    if (pointKey(e.a) === pointKey(e.b)) return null;
    return { start: e.a, end: e.b, forward: [e.a], backward: [e.b] };
  }
  if (e.type === 'arc') {
    const pts = sampleArc(e.c, e.r, e.start, arcSweep(e));
    return {
      start: arcPoint(e.c, e.r, e.start),
      end: arcPoint(e.c, e.r, e.end),
      forward: pts.slice(0, -1),
      backward: pts.slice(1).reverse(),
    };
  }
  return null;
}

/** Finds closed loops made of connected lines/arcs. */
function findChainLoops(entities: SketchEntity[]): Vec2[][] {
  const edges = entities.map(toChainEdge).filter((e): e is ChainEdge => e !== null);
  const consumed = new Set<ChainEdge>();
  const loops: Vec2[][] = [];

  for (const first of edges) {
    if (consumed.has(first)) continue;
    const startKey = pointKey(first.start);
    const path = new Set<ChainEdge>([first]);
    const points: Vec2[] = [...first.forward];
    let endKey = pointKey(first.end);
    let closed = endKey === startKey;

    while (!closed) {
      const next = edges.find(
        (e) => !consumed.has(e) && !path.has(e) && (pointKey(e.start) === endKey || pointKey(e.end) === endKey),
      );
      if (!next) break;
      path.add(next);
      if (pointKey(next.start) === endKey) {
        points.push(...next.forward);
        endKey = pointKey(next.end);
      } else {
        points.push(...next.backward);
        endKey = pointKey(next.start);
      }
      closed = endKey === startKey;
    }

    if (closed) {
      path.forEach((e) => consumed.add(e));
      loops.push(points);
    }
  }
  return loops;
}

/** All closed profiles in a sketch as point loops. */
export function findClosedLoops(entities: SketchEntity[]): Vec2[][] {
  const loops: Vec2[][] = [];
  for (const e of entities) {
    if (e.type === 'rect' && e.w > 0 && e.h > 0) loops.push(rectCorners(e));
    else if (e.type === 'circle' && e.r > 0) loops.push(sampleArc(e.c, e.r, 0, TAU).slice(0, -1));
    else if (e.type === 'polygon' && e.r > 0) loops.push(polygonVertices(e));
  }
  loops.push(...findChainLoops(entities));
  return loops.filter((l) => l.length >= 3 && Math.abs(signedArea(l)) > 1e-6);
}

export function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function loopInside(inner: Vec2[], outer: Vec2[]): boolean {
  let count = 0;
  for (const p of inner) if (pointInPolygon(p, outer)) count++;
  return count > inner.length / 2;
}

/**
 * Converts closed loops into THREE shapes. Loops nested inside another loop
 * become holes; loops nested inside a hole become new islands.
 */
export function loopsToShapes(loops: Vec2[][]): THREE.Shape[] {
  const sorted = [...loops].sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const depth: number[] = [];
  const shapeOf: (THREE.Shape | null)[] = [];
  const shapes: THREE.Shape[] = [];

  sorted.forEach((loop, i) => {
    let parent = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (loopInside(loop, sorted[j])) {
        parent = j;
        break;
      }
    }
    depth[i] = parent < 0 ? 0 : depth[parent] + 1;
    const vecs = loop.map((p) => new THREE.Vector2(p[0], p[1]));
    if (depth[i] % 2 === 0) {
      const shape = new THREE.Shape(vecs);
      shapes.push(shape);
      shapeOf[i] = shape;
    } else {
      shapeOf[parent]?.holes.push(new THREE.Path(vecs));
      shapeOf[i] = null;
    }
  });
  return shapes;
}

export function sketchShapes(entities: SketchEntity[]): THREE.Shape[] {
  return loopsToShapes(findClosedLoops(entities));
}

export function hasClosedProfile(entities: SketchEntity[]): boolean {
  return findClosedLoops(entities).length > 0;
}
