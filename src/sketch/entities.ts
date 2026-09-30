import type {
  ArcEntity,
  PolygonEntity,
  RectEntity,
  SketchEntity,
  SketchEntityType,
  Vec2,
} from '../types/cad';

export const ENTITY_LABEL: Record<SketchEntityType, string> = {
  line: 'Line',
  rect: 'Rectangle',
  circle: 'Circle',
  arc: 'Arc',
  polygon: 'Polygon',
};

export const TAU = Math.PI * 2;
const KEY_PRECISION = 1000;

export function pointKey(p: Vec2): string {
  return `${Math.round(p[0] * KEY_PRECISION)},${Math.round(p[1] * KEY_PRECISION)}`;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function samePoint(a: Vec2, b: Vec2): boolean {
  return pointKey(a) === pointKey(b);
}

export function normalizeAngle(a: number): number {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

/** CCW sweep from start to end in (0, 2π]. */
export function arcSweep(arc: Pick<ArcEntity, 'start' | 'end'>): number {
  const s = normalizeAngle(arc.end - arc.start);
  return s < 1e-9 ? TAU : s;
}

export function arcPoint(c: Vec2, r: number, angle: number): Vec2 {
  return [c[0] + r * Math.cos(angle), c[1] + r * Math.sin(angle)];
}

export function rectCorners(e: Pick<RectEntity, 'x' | 'y' | 'w' | 'h'>): Vec2[] {
  return [
    [e.x, e.y],
    [e.x + e.w, e.y],
    [e.x + e.w, e.y + e.h],
    [e.x, e.y + e.h],
  ];
}

export function polygonVertices(e: Pick<PolygonEntity, 'c' | 'r' | 'sides' | 'angle'>): Vec2[] {
  const n = Math.max(3, Math.round(e.sides));
  return Array.from({ length: n }, (_, i) => arcPoint(e.c, e.r, e.angle + (TAU * i) / n));
}

export function sampleArc(c: Vec2, r: number, start: number, sweep: number, segmentsFull = 96): Vec2[] {
  const segs = Math.max(8, Math.ceil((sweep / TAU) * segmentsFull));
  return Array.from({ length: segs + 1 }, (_, i) => arcPoint(c, r, start + (sweep * i) / segs));
}

/** Points used to draw an entity as a polyline. */
export function entityPolyline(e: SketchEntity): Vec2[] {
  switch (e.type) {
    case 'line':
      return [e.a, e.b];
    case 'rect': {
      const c = rectCorners(e);
      return [...c, c[0]];
    }
    case 'circle':
      return sampleArc(e.c, e.r, 0, TAU);
    case 'arc':
      return sampleArc(e.c, e.r, e.start, arcSweep(e));
    case 'polygon': {
      const v = polygonVertices(e);
      return [...v, v[0]];
    }
  }
}

/** Points that the cursor can snap to. */
export function entitySnapPoints(e: SketchEntity): Vec2[] {
  switch (e.type) {
    case 'line':
      return [e.a, e.b, [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]];
    case 'rect':
      return [...rectCorners(e), [e.x + e.w / 2, e.y + e.h / 2]];
    case 'circle':
      return [e.c];
    case 'arc':
      return [e.c, arcPoint(e.c, e.r, e.start), arcPoint(e.c, e.r, e.end)];
    case 'polygon':
      return [e.c, ...polygonVertices(e)];
  }
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

function distToPolyline(p: Vec2, pts: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, distToSegment(p, pts[i], pts[i + 1]));
  return best;
}

export function distanceToEntity(e: SketchEntity, p: Vec2): number {
  switch (e.type) {
    case 'line':
      return distToSegment(p, e.a, e.b);
    case 'circle':
      return Math.abs(dist(p, e.c) - e.r);
    case 'arc': {
      const ang = normalizeAngle(Math.atan2(p[1] - e.c[1], p[0] - e.c[0]) - e.start);
      if (ang <= arcSweep(e)) return Math.abs(dist(p, e.c) - e.r);
      return Math.min(dist(p, arcPoint(e.c, e.r, e.start)), dist(p, arcPoint(e.c, e.r, e.end)));
    }
    default:
      return distToPolyline(p, entityPolyline(e));
  }
}

export function hitTestEntities(entities: SketchEntity[], p: Vec2, tolerance: number): SketchEntity | null {
  let best: SketchEntity | null = null;
  let bestDist = tolerance;
  for (const e of entities) {
    const d = distanceToEntity(e, p);
    if (d <= bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Changes a line's length by moving its end point along its direction.
 * Other line endpoints that were connected to the moved point follow it,
 * so closed chains stay connected.
 */
export function setLineLength(entities: SketchEntity[], id: string, length: number): SketchEntity[] {
  const line = entities.find((e) => e.id === id);
  if (!line || line.type !== 'line' || length <= 0) return entities;
  const len = dist(line.a, line.b);
  const dir: Vec2 = len > 0 ? [(line.b[0] - line.a[0]) / len, (line.b[1] - line.a[1]) / len] : [1, 0];
  const newB: Vec2 = [line.a[0] + dir[0] * length, line.a[1] + dir[1] * length];
  return moveLinePoint(entities, line.b, newB);
}

/** Moves every line endpoint located at `from` to `to`. */
export function moveLinePoint(entities: SketchEntity[], from: Vec2, to: Vec2): SketchEntity[] {
  const key = pointKey(from);
  return entities.map((e) => {
    if (e.type !== 'line') return e;
    const a = pointKey(e.a) === key ? to : e.a;
    const b = pointKey(e.b) === key ? to : e.b;
    return a === e.a && b === e.b ? e : { ...e, a, b };
  });
}

export function normalizeRect(x0: number, y0: number, x1: number, y1: number) {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}
