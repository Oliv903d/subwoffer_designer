import type { BoxFace, DriverMount, EnclosureDim, EnclosureObject, EnclosureShape, Vec2 } from '../types/cad';
import {
  MAX_PORT_VELOCITY,
  minPortArea,
  portedAlignment,
  portLengthFor,
  portVelocity,
  recommendedPortArea,
  sealedAlignment,
  tuningFor,
  type Alignment,
} from './acoustics';

const DEG = Math.PI / 180;
/** Wall thickness of round port tubes (mm). */
export const PORT_WALL = 3;
const MIN_INNER = 20;
const MAX_SIZE = 5000;
const STANDARD_PORT_DIAMETERS = [50, 63, 75, 90, 100, 110, 125, 150, 160, 200];

/** A point in the box's side profile: z = front/back, y = up. */
export interface ZY {
  z: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Shape and profile
// ---------------------------------------------------------------------------

export function slantTan(s: EnclosureShape): { tf: number; tb: number } {
  const t = Math.tan(s.slantAngle * DEG);
  return { tf: s.slant === 'front' ? t : 0, tb: s.slant === 'back' ? t : 0 };
}

export function innerWidth(s: EnclosureShape): number {
  return s.width - 2 * s.thickness;
}

export function topDepth(s: EnclosureShape): number {
  const { tf, tb } = slantTan(s);
  return s.depth - s.height * (tf + tb);
}

/** Outer side profile, counter-clockwise: back-bottom, front-bottom, front-top, back-top. */
export function outerProfile(s: EnclosureShape): ZY[] {
  const { tf, tb } = slantTan(s);
  const { depth: D, height: H } = s;
  return [
    { z: -D / 2, y: 0 },
    { z: D / 2, y: 0 },
    { z: D / 2 - H * tf, y: H },
    { z: -D / 2 + H * tb, y: H },
  ];
}

/** Offsets a convex counter-clockwise polygon inwards by `d`. */
export function insetPolygon(poly: ZY[], d: number): ZY[] {
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const len = Math.hypot(b.z - a.z, b.y - a.y) || 1;
    const dir = { z: (b.z - a.z) / len, y: (b.y - a.y) / len };
    return { p: { z: a.z - dir.y * d, y: a.y + dir.z * d }, dir };
  });
  return lines.map((cur, i) => {
    const prev = lines[(i - 1 + n) % n];
    const cross = prev.dir.z * cur.dir.y - prev.dir.y * cur.dir.z;
    if (Math.abs(cross) < 1e-9) return cur.p;
    const dz = cur.p.z - prev.p.z;
    const dy = cur.p.y - prev.p.y;
    const s = (dz * cur.dir.y - dy * cur.dir.z) / cross;
    return { z: prev.p.z + prev.dir.z * s, y: prev.p.y + prev.dir.y * s };
  });
}

function polyArea(poly: ZY[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.z * q.y - q.z * p.y;
  }
  return Math.abs(a) / 2;
}

export function zFrontOuter(s: EnclosureShape, y: number): number {
  return s.depth / 2 - y * slantTan(s).tf;
}

/** Horizontal thickness of a panel tilted by an angle with tangent `tan`. */
function horizontalThickness(t: number, tan: number): number {
  return t * Math.sqrt(1 + tan * tan);
}

export function zFrontInner(s: EnclosureShape, y: number): number {
  return zFrontOuter(s, y) - horizontalThickness(s.thickness, slantTan(s).tf);
}

export function zBackInner(s: EnclosureShape, y: number): number {
  const { tb } = slantTan(s);
  return -s.depth / 2 + y * tb + horizontalThickness(s.thickness, tb);
}

// ---------------------------------------------------------------------------
// Baffle (front panel) coordinates: u across the width, v up along the face
// ---------------------------------------------------------------------------

export interface Baffle {
  cos: number;
  sin: number;
  length: number;
}

export function baffle(s: EnclosureShape): Baffle {
  const { tf } = slantTan(s);
  const cos = 1 / Math.sqrt(1 + tf * tf);
  return { cos, sin: tf * cos, length: s.height / cos };
}

/** Baffle (u, v) → box-local [x, y, z] on the outer face. */
export function baffleToLocal(s: EnclosureShape, p: Vec2): [number, number, number] {
  const b = baffle(s);
  return [p[0], p[1] * b.cos, s.depth / 2 - p[1] * b.sin];
}

/** Box-local point → baffle (u, v), projected onto the baffle plane. */
export function localToBaffle(s: EnclosureShape, x: number, y: number, z: number): Vec2 {
  const b = baffle(s);
  return [x, (z - s.depth / 2) * -b.sin + y * b.cos];
}

/** Outward baffle normal in box-local coordinates. */
export function baffleNormal(s: EnclosureShape): [number, number, number] {
  const b = baffle(s);
  return [0, b.sin, b.cos];
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export function isPorted(o: EnclosureObject): boolean {
  return o.design.boxType === 'ported';
}

export function portCount(o: EnclosureObject): number {
  return o.port.shape === 'round' ? o.port.positions.length : 1;
}

/** Total port opening area (mm²). */
export function portArea(o: EnclosureObject): number {
  if (o.port.shape === 'slot') return o.port.slotHeight * innerWidth(o.shape);
  return o.port.positions.length * Math.PI * (o.port.diameter / 2) ** 2;
}

/** Height taken at the bottom of the baffle by a slot port (opening + shelf). */
function slotBlock(o: EnclosureObject): number {
  return isPorted(o) && o.port.shape === 'slot' ? o.port.slotHeight + o.shape.thickness : 0;
}

export interface SlotPath {
  folded: boolean;
  /** Shelf z range (box-local). */
  shelfZ0: number;
  shelfZ1: number;
  /** Top of the vertical port wall for folded ports. */
  wallTop: number;
  fits: boolean;
  displacement: number;
}

/**
 * Layout of a bottom slot port of centre-line length L. The port runs straight back
 * along the bottom and, if it is too long, folds up along the back wall.
 */
export function slotPath(o: EnclosureObject, L: number): SlotPath {
  const s = o.shape;
  const t = s.thickness;
  const h = o.port.slotHeight;
  const wi = innerWidth(s);
  const yc = t + h / 2;
  const zFO = zFrontOuter(s, yc);
  const zFI = zFrontInner(s, yc);
  const zBI = zBackInner(s, yc);
  const shelfFront = zFrontOuter(s, t + h + t / 2) - horizontalThickness(t, slantTan(s).tf) / 2;
  const straightEnd = zFO - L;

  if (straightEnd >= zBI + h || s.slant === 'back') {
    const fits = straightEnd >= zBI + h;
    const shelfZ0 = Math.max(straightEnd, zBI + h);
    return {
      folded: false,
      shelfZ0,
      shelfZ1: shelfFront,
      wallTop: 0,
      fits,
      displacement: wi * (h + t) * Math.max(0, zFI - shelfZ0),
    };
  }

  const l1 = zFO - (zBI + h / 2);
  const yEnd = yc + (L - l1);
  const yMax = s.height - t - h;
  const wallTop = Math.max(t + h + t, Math.min(yEnd, yMax));
  return {
    folded: true,
    shelfZ0: zBI + h,
    shelfZ1: shelfFront,
    wallTop,
    fits: yEnd <= yMax,
    displacement: wi * (h + t) * (zFI - zBI) + wi * (h + t) * Math.max(0, wallTop - (t + h + t)),
  };
}

function portDisplacement(o: EnclosureObject, L: number): number {
  if (!isPorted(o)) return 0;
  if (o.port.shape === 'slot') return slotPath(o, L).displacement;
  const r = o.port.diameter / 2 + PORT_WALL;
  return o.port.positions.length * Math.PI * r * r * Math.max(0, L - o.shape.thickness);
}

function minPortLength(o: EnclosureObject): number {
  const t = o.shape.thickness;
  return o.port.shape === 'slot' ? horizontalThickness(t, slantTan(o.shape).tf) : t;
}

// ---------------------------------------------------------------------------
// Volumes and targets
// ---------------------------------------------------------------------------

export interface Volumes {
  gross: number;
  drivers: number;
  port: number;
  net: number;
}

/** Volumes in litres. */
export function volumes(o: EnclosureObject, portLength = o.port.length): Volumes {
  const s = o.shape;
  const gross = (polyArea(insetPolygon(outerProfile(s), s.thickness)) * innerWidth(s)) / 1e6;
  const drivers = o.driver.displacement * o.drivers.length;
  const port = portDisplacement(o, portLength) / 1e6;
  return { gross, drivers, port, net: gross - drivers - port };
}

export interface Targets {
  vb: number | null;
  fb: number | null;
  calculated: Alignment;
}

export function targets(o: EnclosureObject): Targets {
  const n = Math.max(1, o.drivers.length);
  const calculated =
    o.design.boxType === 'sealed' ? sealedAlignment(o.driver, n, o.design.qtc) : portedAlignment(o.driver, n);
  return {
    vb: o.design.targetVolume ?? calculated.vb,
    fb: isPorted(o) ? (o.design.tuning ?? calculated.f) : null,
    calculated,
  };
}

/** Port length that hits `fb`, solved together with the net volume it leaves. */
function autoPortLength(o: EnclosureObject, fb: number): number {
  const area = portArea(o);
  const count = portCount(o);
  const min = minPortLength(o);
  let L = Math.max(min, o.port.length || 100);
  for (let i = 0; i < 8; i++) {
    const net = volumes(o, L).net;
    if (net <= 0 || area <= 0) break;
    L = Math.max(min, portLengthFor(net, fb, area, count));
  }
  return L;
}

function netVolume(o: EnclosureObject, fb: number | null): number {
  const L = isPorted(o) && o.port.autoLength && fb ? autoPortLength(o, fb) : o.port.length;
  return volumes(o, L).net;
}

// ---------------------------------------------------------------------------
// Keeping the box valid and on target
// ---------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export function clampShape(s: EnclosureShape): EnclosureShape {
  const t = clamp(s.thickness, 3, 60);
  const minOuter = 2 * t + MIN_INNER;
  const width = clamp(s.width, minOuter, MAX_SIZE);
  const height = clamp(s.height, minOuter, MAX_SIZE);
  const depth = clamp(s.depth, minOuter, MAX_SIZE);
  let slantAngle = clamp(s.slantAngle, 0, 60);
  if (s.slant !== 'none') {
    const maxAngle = Math.atan(Math.max(0, depth - minOuter) / height) / DEG;
    slantAngle = Math.min(slantAngle, Math.floor(maxAngle * 10) / 10);
  }
  return { ...s, thickness: t, width, height, depth, slantAngle };
}

function dimRange(o: EnclosureObject, dim: EnclosureDim): [number, number] {
  const s = o.shape;
  const t = s.thickness;
  const { tf, tb } = slantTan(s);
  const base = 2 * t + MIN_INNER;
  if (dim === 'width') return [base, MAX_SIZE];
  if (dim === 'depth') return [base + s.height * (tf + tb), MAX_SIZE];
  const hi = tf + tb > 0 ? (s.depth - base) / (tf + tb) : MAX_SIZE;
  return [base + slotBlock(o), Math.max(base + slotBlock(o), hi)];
}

/** Changes the slot height so the slot keeps `area` after a width change. */
function keepSlotArea(o: EnclosureObject, area: number): EnclosureObject {
  if (o.port.shape !== 'slot' || area <= 0) return o;
  const slotHeight = round1(Math.max(10, area / Math.max(1, innerWidth(o.shape))));
  return slotHeight === o.port.slotHeight ? o : { ...o, port: { ...o.port, slotHeight } };
}

/** Resizes one dimension so the net volume matches `vb` (bisection; volume grows with every size). */
function solveDimension(o: EnclosureObject, dim: EnclosureDim, vb: number, fb: number | null): EnclosureObject {
  const area = portArea(o);
  const withDim = (x: number): EnclosureObject => {
    const next = { ...o, shape: { ...o.shape, [dim]: x } };
    return dim === 'width' && isPorted(o) ? keepSlotArea(next, area) : next;
  };
  let [lo, hi] = dimRange(o, dim);
  if (netVolume(withDim(hi), fb) < vb) return withDim(hi);
  if (netVolume(withDim(lo), fb) > vb) return withDim(lo);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (netVolume(withDim(mid), fb) < vb) lo = mid;
    else hi = mid;
  }
  return withDim(round1((lo + hi) / 2));
}

export interface PlacementRange {
  uMax: number;
  vMin: number;
  vMax: number;
  fits: boolean;
}

/** Where a circular cutout's centre may go on the baffle. */
export function placementRange(o: EnclosureObject, rCut: number, rFlange: number): PlacementRange {
  const s = o.shape;
  const b = baffle(s);
  const uMax = Math.min(s.width / 2 - rFlange, innerWidth(s) / 2 - rCut);
  const vMin = Math.max(rFlange, (s.thickness + slotBlock(o)) / b.cos + rCut);
  const vMax = Math.min(b.length - rFlange, (s.height - s.thickness) / b.cos - rCut);
  return { uMax, vMin, vMax, fits: uMax >= 0 && vMax >= vMin };
}

function clampToRange(p: Vec2, r: PlacementRange): Vec2 {
  const u = r.uMax >= 0 ? clamp(p[0], -r.uMax, r.uMax) : 0;
  const v = r.vMax >= r.vMin ? clamp(p[1], r.vMin, r.vMax) : (r.vMin + r.vMax) / 2;
  return [round1(u), round1(v)];
}

export function driverRange(o: EnclosureObject): PlacementRange {
  return placementRange(o, o.driver.cutoutDiameter / 2, o.driver.outerDiameter / 2);
}

export function roundPortRange(o: EnclosureObject): PlacementRange {
  const r = o.port.diameter / 2 + PORT_WALL;
  return placementRange(o, r, r);
}

export function clampDriverPosition(o: EnclosureObject, p: Vec2): Vec2 {
  return clampToRange(p, driverRange(o));
}

export function clampPortPosition(o: EnclosureObject, p: Vec2): Vec2 {
  return clampToRange(p, roundPortRange(o));
}

// ---------------------------------------------------------------------------
// Sides of the box as mounting surfaces
// ---------------------------------------------------------------------------

type V3 = [number, number, number];

const FACE_OUTWARD: Record<BoxFace, V3> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
};

export const OPPOSITE_FACE: Record<BoxFace, BoxFace> = {
  top: 'bottom',
  bottom: 'top',
  front: 'back',
  back: 'front',
  left: 'right',
  right: 'left',
};

export const BOX_FACES: BoxFace[] = ['front', 'back', 'top', 'bottom', 'left', 'right'];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: V3): V3 => scale(a, 1 / (Math.hypot(...a) || 1));

/** Outer corners of a side (box-local). */
export function faceCorners(s: EnclosureShape, face: BoxFace): V3[] {
  const hw = s.width / 2;
  const [p0, p1, p2, p3] = outerProfile(s);
  const at = (x: number, p: ZY): V3 => [x, p.y, p.z];
  switch (face) {
    case 'left':
      return [at(-hw, p0), at(-hw, p1), at(-hw, p2), at(-hw, p3)];
    case 'right':
      return [at(hw, p0), at(hw, p1), at(hw, p2), at(hw, p3)];
    case 'bottom':
      return [at(-hw, p0), at(hw, p0), at(hw, p1), at(-hw, p1)];
    case 'top':
      return [at(-hw, p3), at(hw, p3), at(hw, p2), at(-hw, p2)];
    case 'front':
      return [at(-hw, p1), at(hw, p1), at(hw, p2), at(-hw, p2)];
    case 'back':
      return [at(-hw, p0), at(hw, p0), at(hw, p3), at(-hw, p3)];
  }
}

export interface FaceFrame {
  origin: V3;
  u: V3;
  v: V3;
  /** Outward normal. */
  n: V3;
}

/**
 * (u, v) coordinates on a side: v points up (towards the back on the top/bottom), n outwards.
 * The front uses its bottom-centre as origin so it matches the baffle coordinates.
 */
export function faceFrame(s: EnclosureShape, face: BoxFace): FaceFrame {
  const c = faceCorners(s, face);
  let n = unit(cross(sub(c[1], c[0]), sub(c[2], c[0])));
  if (dot(n, FACE_OUTWARD[face]) < 0) n = scale(n, -1);
  const vRef: V3 = Math.abs(n[1]) > 0.9 ? [0, 0, -1] : [0, 1, 0];
  const v = unit(sub(vRef, scale(n, dot(n, vRef))));
  const u = cross(v, n);
  const origin: V3 =
    face === 'front'
      ? baffleToLocal(s, [0, 0])
      : scale(c.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]] as V3, [0, 0, 0]), 1 / 4);
  return { origin, u, v, n };
}

export function faceToLocal(s: EnclosureShape, face: BoxFace, p: Vec2): V3 {
  const f = faceFrame(s, face);
  return [0, 1, 2].map((i) => f.origin[i] + f.u[i] * p[0] + f.v[i] * p[1]) as V3;
}

export function localToFace(s: EnclosureShape, face: BoxFace, point: V3): Vec2 {
  const f = faceFrame(s, face);
  const d = sub(point, f.origin);
  return [dot(d, f.u), dot(d, f.v)];
}

/** A side's outline in its own (u, v) coordinates, counter-clockwise. */
export function facePolygon(s: EnclosureShape, face: BoxFace): Vec2[] {
  const pts = faceCorners(s, face).map((c) => localToFace(s, face, c));
  let area = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    area += p[0] * q[1] - q[0] * p[1];
  });
  return area < 0 ? pts.reverse() : pts;
}

export function insidePolygon(poly: Vec2[], p: Vec2): boolean {
  return poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-6;
  });
}

function nearestOnPolygon(poly: Vec2[], p: Vec2): Vec2 {
  let best: Vec2 = poly[0];
  let bestD = Infinity;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2, 0, 1);
    const q: Vec2 = [a[0] + dx * t, a[1] + dy * t];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  });
  return best;
}

/** Area where a subwoofer's centre may go on a side, or null if it does not fit. */
function mountRegion(o: EnclosureObject, face: BoxFace): Vec2[] | null {
  const rf = o.driver.outerDiameter / 2;
  const rc = o.driver.cutoutDiameter / 2;
  const outline = facePolygon(o.shape, face).map(([z, y]) => ({ z, y }));
  const inset = insetPolygon(outline, Math.max(rf, o.shape.thickness + rc)).map((q): Vec2 => [q.z, q.y]);
  let area = 0;
  inset.forEach((p, i) => {
    const q = inset[(i + 1) % inset.length];
    area += p[0] * q[1] - q[0] * p[1];
  });
  return area > 1 ? inset : null;
}

export function mountFits(o: EnclosureObject, face: BoxFace): boolean {
  return face === 'front' ? driverRange(o).fits : mountRegion(o, face) !== null;
}

/** Keeps a subwoofer fully on its side (and above a slot port on the front). */
export function clampMount(o: EnclosureObject, m: DriverMount): DriverMount {
  if (m.face === 'front') return { face: 'front', p: clampDriverPosition(o, m.p) };
  const region = mountRegion(o, m.face);
  if (!region) return { face: m.face, p: [0, 0] };
  const p = insidePolygon(region, m.p) ? m.p : nearestOnPolygon(region, m.p);
  return { face: m.face, p: [round1(p[0]), round1(p[1])] };
}

export function centerMount(o: EnclosureObject, face: BoxFace): DriverMount {
  if (face === 'front') {
    const r = driverRange(o);
    return clampMount(o, { face, p: [0, (r.vMin + r.vMax) / 2] });
  }
  return clampMount(o, { face, p: [0, 0] });
}

/**
 * Normalizes an enclosure after any edit: clamps sizes, keeps the net volume on target
 * (resizing one dimension) when locked, recalculates the port length and keeps
 * subwoofers and ports on the baffle. `edited` is the dimension the user just changed;
 * `previous` is the state before the edit (used to keep the slot port area when the width changes).
 */
export function finalizeEnclosure(
  o: EnclosureObject,
  edited: EnclosureDim | null = null,
  previous?: EnclosureObject,
): EnclosureObject {
  let next: EnclosureObject = { ...o, shape: clampShape(o.shape) };
  const maxSlot = Math.max(10, next.shape.height - 3 * next.shape.thickness - 40);
  if (next.port.slotHeight > maxSlot) next = { ...next, port: { ...next.port, slotHeight: maxSlot } };
  if (previous && isPorted(next) && next.port.slotHeight === previous.port.slotHeight && next.shape.width !== previous.shape.width) {
    next = keepSlotArea(next, portArea(previous));
  }
  const tg = targets(next);

  if (next.design.lockVolume && tg.vb && tg.vb > 0) {
    let dim = next.design.adjust;
    if (edited === dim) dim = (['depth', 'height', 'width'] as const).find((d) => d !== edited)!;
    next = solveDimension(next, dim, tg.vb, tg.fb);
    next = { ...next, shape: clampShape(next.shape) };
  }

  if (isPorted(next) && next.port.autoLength && tg.fb) {
    next = { ...next, port: { ...next.port, length: round1(autoPortLength(next, tg.fb)) } };
  }

  return {
    ...next,
    drivers: next.drivers.map((m) => clampMount(next, m)),
    port: { ...next.port, positions: next.port.positions.map((p) => clampPortPosition(next, p)) },
  };
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function evenDriverPositions(
  o: EnclosureObject,
  count: number,
  reserveRight = 0,
  stacked = false,
): DriverMount[] {
  const r = driverRange(o);
  const wi = innerWidth(o.shape) - reserveRight;
  const left = -innerWidth(o.shape) / 2;
  const front = (p: Vec2): DriverMount => ({ face: 'front', p: clampToRange(p, r) });
  if (stacked && count > 1) {
    return Array.from({ length: count }, (_, i) => front([left + wi / 2, r.vMin + ((r.vMax - r.vMin) * i) / (count - 1)]));
  }
  const v = (r.vMin + r.vMax) / 2;
  return Array.from({ length: count }, (_, i) => front([left + (wi * (i + 0.5)) / count, v]));
}

/** Places round ports where they are farthest from the subwoofers and each other. */
export function autoPlaceRoundPorts(o: EnclosureObject, count: number): Vec2[] {
  const r = roundPortRange(o);
  const pr = o.port.diameter / 2 + PORT_WALL;
  const obstacles = o.drivers.filter((m) => m.face === 'front').map((m) => ({ p: m.p, r: o.driver.outerDiameter / 2 }));
  const placed: Vec2[] = [];
  const steps = 24;
  for (let k = 0; k < count; k++) {
    let best: Vec2 = clampToRange([0, r.vMin], r);
    let bestScore = -Infinity;
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const c: Vec2 = [-r.uMax + (2 * r.uMax * i) / steps, r.vMin + ((r.vMax - r.vMin) * j) / steps];
        const others = [...obstacles, ...placed.map((p) => ({ p, r: pr }))];
        const score = Math.min(
          ...others.map((ob) => Math.hypot(c[0] - ob.p[0], c[1] - ob.p[1]) - ob.r - pr),
          1e6,
        );
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
    }
    placed.push(clampToRange(best, r));
  }
  return placed;
}

// ---------------------------------------------------------------------------
// Auto design
// ---------------------------------------------------------------------------

/**
 * Creates a well-proportioned box that hits the target volume and tuning. For ported boxes
 * it starts with the recommended port area and shrinks it (never below the minimum) until
 * the port fits inside the box.
 */
export function autoDesign(o: EnclosureObject): EnclosureObject {
  const tg = targets(o);
  if (!tg.vb || tg.vb <= 0) return o;
  if (!isPorted(o) || !tg.fb) return designWithArea(o, 0);
  const n = Math.max(1, o.drivers.length);
  const min = minPortArea(o.driver, n, tg.fb);
  const rec = recommendedPortArea(o.driver, n, tg.vb, tg.fb);
  let design = o;
  for (const shape of o.port.shape === 'round' ? (['round', 'slot'] as const) : (['slot'] as const)) {
    const base = { ...o, port: { ...o.port, shape } };
    for (let i = 0; i <= 8; i++) {
      design = designWithArea(base, rec * (min / rec) ** (i / 8));
      if (analyze(design).port?.fits !== false) return design;
    }
  }
  return design;
}

function designWithArea(o: EnclosureObject, areaReq: number): EnclosureObject {
  const tg = targets(o);
  if (!tg.vb) return o;
  const t = o.shape.thickness;
  const n = Math.max(1, o.drivers.length);
  const rf = o.driver.outerDiameter / 2;
  const ported = isPorted(o);

  let port = { ...o.port, autoLength: true };
  let portCountRound = 0;
  if (ported && port.shape === 'round') {
    const choice = [1, 2]
      .flatMap((count) => STANDARD_PORT_DIAMETERS.map((d) => ({ count, d, area: count * Math.PI * (d / 2) ** 2 })))
      .find((c) => c.area >= areaReq);
    if (choice) {
      port = { ...port, diameter: choice.d };
      portCountRound = choice.count;
    } else {
      port = { ...port, shape: 'slot' };
    }
  }

  const roundSpace = portCountRound * (port.diameter + 2 * PORT_WALL + 20);
  const cell = 2 * rf + 20;
  const slotHeight = (w: number) => Math.max(25, Math.ceil(areaReq / (w - 2 * t)));
  const minDepth = o.driver.mountingDepth + 2 * t + 20;
  const build = (w: number, h: number, d: number): EnclosureObject => ({
    ...o,
    shape: { ...o.shape, width: w, height: h, depth: d },
    port: { ...port, slotHeight: slotHeight(w) },
    design: { ...o.design, lockVolume: true, adjust: 'depth', autoShape: true },
  });

  // Try side-by-side and stacked subwoofers and several widths; for each, grow height and
  // depth together until the volume is right. Keep the candidate where everything fits and
  // the proportions are the most box-like.
  let best: { obj: EnclosureObject; score: number } | null = null;
  for (const stacked of n > 1 ? [false, true] : [false]) {
    const minW = (stacked ? cell : n * cell) + roundSpace + 2 * t;
    const minH = (w: number) =>
      (stacked ? n * cell : cell) + 2 * t + (ported && port.shape === 'slot' ? slotHeight(w) + t : 0);
    const variants = Array.from({ length: 13 }, (_, i) => [0.9, 0.65].map((depthRatio) => ({ i, depthRatio }))).flat();
    for (const { i, depthRatio } of variants) {
      const W = Math.ceil(minW * (1 + i * 0.12));
      const hMin = minH(W);
      const withScale = (x: number) => build(W, Math.max(hMin, x), Math.max(minDepth, x * depthRatio));
      let lo = 2 * t + MIN_INNER;
      let hi = MAX_SIZE;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (netVolume(withScale(mid), tg.fb) < tg.vb) lo = mid;
        else hi = mid;
      }
      const scaled = withScale(hi);
      let candidate = solveDimension(build(W, Math.ceil(scaled.shape.height), scaled.shape.depth), 'depth', tg.vb, tg.fb);
      candidate = { ...candidate, drivers: evenDriverPositions(candidate, n, roundSpace, stacked) };
      if (candidate.port.shape === 'round') {
        const count = Math.max(1, portCountRound || candidate.port.positions.length);
        candidate = { ...candidate, port: { ...candidate.port, positions: autoPlaceRoundPorts(candidate, count) } };
      }
      candidate = finalizeEnclosure(candidate);

      const a = analyze(candidate);
      const { width: w, height: h, depth: d } = candidate.shape;
      const ratio = Math.max(w, h, d) / Math.min(w, h, d);
      const score =
        (a.port?.fits === false ? 1000 : 0) +
        (candidate.drivers.every((m) => mountFits(candidate, m.face)) ? 0 : 500) +
        a.warnings.length * 10 +
        ratio +
        0.2 * Math.abs(w / h - 1.3);
      if (!best || score < best.score) best = { obj: candidate, score };
    }
  }
  return best!.obj;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export interface PortReport {
  minArea: number;
  recommendedArea: number;
  area: number;
  requiredLength: number | null;
  length: number;
  tuning: number;
  velocity: number;
  folded: boolean;
  fits: boolean;
}

export interface Analysis {
  targets: Targets;
  volumes: Volumes;
  /** Relative difference between current and target net volume. */
  volumeError: number | null;
  port: PortReport | null;
  warnings: string[];
}

function circlesOverlap(a: Vec2, ra: number, b: Vec2, rb: number): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < ra + rb - 0.5;
}

/** Free depth behind the baffle along its normal at baffle position v (mm). */
function depthBehind(o: EnclosureObject, v: number, backOffset: number, bottomLimit: number): number {
  const s = o.shape;
  const b = baffle(s);
  const y = v * b.cos;
  const horizontal = (zFrontOuter(s, y) - (zBackInner(s, y) + backOffset)) / b.cos;
  const vertical = b.sin > 1e-6 ? (y - bottomLimit) / b.sin : Infinity;
  return Math.min(horizontal, vertical);
}

export function analyze(o: EnclosureObject): Analysis {
  const tg = targets(o);
  const vol = volumes(o);
  const warnings: string[] = [];
  const n = o.drivers.length;
  const s = o.shape;
  if (tg.calculated.note && o.design.targetVolume === null) warnings.push(tg.calculated.note);

  let port: PortReport | null = null;
  let slot: SlotPath | null = null;
  if (isPorted(o)) {
    const area = portArea(o);
    const count = portCount(o);
    const fb = tg.fb ?? 0;
    slot = o.port.shape === 'slot' ? slotPath(o, o.port.length) : null;
    let fits = true;
    if (slot) fits = slot.fits;
    else {
      o.port.positions.forEach((p) => {
        const avail = depthBehind(o, p[1], 0, s.thickness);
        if (o.port.length > avail - o.port.diameter / 2) fits = false;
      });
    }
    const tuning = tuningFor(vol.net, area, count, o.port.length);
    port = {
      minArea: fb ? minPortArea(o.driver, n, fb) : 0,
      recommendedArea: tg.vb && fb ? recommendedPortArea(o.driver, n, tg.vb, fb) : 0,
      area,
      requiredLength: fb && vol.net > 0 ? Math.max(minPortLength(o), portLengthFor(vol.net, fb, area, count)) : null,
      length: o.port.length,
      tuning,
      velocity: portVelocity(o.driver, n, tuning, area),
      folded: slot?.folded ?? false,
      fits,
    };
    if (o.port.shape === 'round' && o.port.positions.length === 0) warnings.push('Add at least one round port.');
    if (!fits)
      warnings.push(
        o.port.shape === 'slot'
          ? 'The port is too long to fit, even folded. Make the box taller/deeper or lower the port area.'
          : 'A round port tube hits the back of the box. Use a slot port or make the box deeper.',
      );
    if (port.velocity > MAX_PORT_VELOCITY)
      warnings.push(`Port air speed ≈ ${Math.round(port.velocity)} m/s — expect port noise. Make the port area bigger.`);
  }

  const volumeError = tg.vb ? (vol.net - tg.vb) / tg.vb : null;
  if (volumeError !== null && Math.abs(volumeError) > 0.05)
    warnings.push(`Net volume is ${Math.round(Math.abs(volumeError) * 100)}% ${volumeError > 0 ? 'above' : 'below'} target.`);
  if (vol.net <= 0) warnings.push('The box has no usable air space.');

  const rf = o.driver.outerDiameter / 2;
  const pr = o.port.diameter / 2 + PORT_WALL;
  const backOffset = slot?.folded ? o.port.slotHeight + s.thickness : 0;
  o.drivers.forEach((a, i) => {
    const name = o.drivers.length > 1 ? `Subwoofer ${i + 1}` : 'The subwoofer';
    if (!mountFits(o, a.face)) warnings.push(`${name} does not fit on the ${a.face} side. Make that side bigger.`);
    o.drivers.slice(i + 1).forEach((b) => {
      if (a.face === b.face && circlesOverlap(a.p, rf, b.p, rf)) warnings.push('Two subwoofers overlap.');
    });
    if (a.face === 'front' && isPorted(o) && o.port.shape === 'round')
      o.port.positions.forEach((p) => {
        if (circlesOverlap(a.p, rf, p, pr)) warnings.push('A port overlaps a subwoofer.');
      });
    if (slot && (a.face === 'bottom' || (a.face === 'back' && slot.folded)))
      warnings.push(`${name} on the ${a.face} would fire into the slot port. Move it or use round ports.`);
    const avail =
      a.face === 'front'
        ? depthBehind(o, a.p[1], backOffset, s.thickness + slotBlock(o))
        : depthBehindSide(o, a);
    if (o.driver.mountingDepth > avail)
      warnings.push(`Not enough depth behind ${name.toLowerCase()} (needs ${o.driver.mountingDepth} mm, has ${Math.floor(avail)} mm).`);
  });

  return { targets: tg, volumes: vol, volumeError, port, warnings: [...new Set(warnings)] };
}

/** Free depth behind a subwoofer on any side except the front, up to the opposite panel (mm). */
function depthBehindSide(o: EnclosureObject, m: DriverMount): number {
  const s = o.shape;
  const f = faceFrame(s, m.face);
  const opp = faceFrame(s, OPPOSITE_FACE[m.face]);
  const p = faceToLocal(s, m.face, m.p);
  const along = dot(f.n, opp.n);
  if (Math.abs(along) < 1e-6) return Infinity;
  return dot(sub(p, opp.origin), opp.n) / along - s.thickness;
}

// ---------------------------------------------------------------------------
// Cut list
// ---------------------------------------------------------------------------

export interface CutPanel {
  name: string;
  qty: number;
  a: number;
  b: number;
  note?: string;
}

export function cutList(o: EnclosureObject): CutPanel[] {
  const s = o.shape;
  const t = s.thickness;
  const wi = innerWidth(s);
  const { tf, tb } = slantTan(s);
  const top = topDepth(s);
  const angle = `${s.slantAngle}°`;
  const holes = (...faces: BoxFace[]) => {
    const n = o.drivers.filter((m) => faces.includes(m.face)).length;
    return n ? `${n}× Ø${o.driver.cutoutDiameter} mm cutout` : '';
  };
  const notes = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(', ') || undefined;
  const sideHoles = (['left', 'right'] as const)
    .map((f) => (holes(f) ? `${f}: ${holes(f)}` : ''))
    .filter(Boolean)
    .join('; ');
  const panels: CutPanel[] = [
    {
      name: 'Side',
      qty: 2,
      a: s.height,
      b: s.depth,
      note: notes(s.slant !== 'none' && `Angled: ${Math.round(top)} mm deep at the top`, sideHoles),
    },
    { name: 'Top', qty: 1, a: wi, b: top, note: notes(s.slant !== 'none' && `Bevel ${s.slant} edge ${angle}`, holes('top')) },
    {
      name: 'Bottom',
      qty: 1,
      a: wi,
      b: s.depth,
      note: notes(s.slant !== 'none' && `Bevel ${s.slant} edge ${angle}`, holes('bottom')),
    },
    {
      name: 'Front (baffle)',
      qty: 1,
      a: wi,
      b: (s.height - 2 * t) * Math.sqrt(1 + tf * tf),
      note: notes(holes('front'), tf > 0 && `bevel ${angle}`),
    },
    {
      name: 'Back',
      qty: 1,
      a: wi,
      b: (s.height - 2 * t) * Math.sqrt(1 + tb * tb),
      note: notes(tb > 0 && `Bevel ${angle}`, holes('back')),
    },
  ];
  if (isPorted(o) && o.port.shape === 'slot') {
    const path = slotPath(o, o.port.length);
    panels.push({ name: 'Port shelf', qty: 1, a: wi, b: path.shelfZ1 - path.shelfZ0 });
    if (path.folded) panels.push({ name: 'Port wall (back)', qty: 1, a: wi, b: path.wallTop - (t + o.port.slotHeight) });
  }
  if (isPorted(o) && o.port.shape === 'round') {
    panels.push({
      name: 'Port tube',
      qty: o.port.positions.length,
      a: o.port.diameter,
      b: o.port.length,
      note: `Inner Ø × length; hole Ø${o.port.diameter + 2 * PORT_WALL} mm`,
    });
  }
  return panels.map((p) => ({ ...p, a: round1(p.a), b: round1(p.b) }));
}
