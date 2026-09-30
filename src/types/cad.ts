export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export type Units = 'mm' | 'cm' | 'in';

/** Rotation is stored in degrees; lengths in millimetres. */
export interface Transform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export type PrimitiveShape = 'box' | 'cylinder' | 'sphere' | 'cone' | 'tube';

export type SketchPlane = 'XY' | 'XZ' | 'YZ';

export interface LineEntity {
  id: string;
  type: 'line';
  a: Vec2;
  b: Vec2;
}

/** Axis-aligned rectangle in sketch coordinates; (x, y) is the lower-left corner. */
export interface RectEntity {
  id: string;
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CircleEntity {
  id: string;
  type: 'circle';
  c: Vec2;
  r: number;
}

/** Counter-clockwise arc from `start` to `end` (radians). */
export interface ArcEntity {
  id: string;
  type: 'arc';
  c: Vec2;
  r: number;
  start: number;
  end: number;
}

/** Regular polygon inscribed in a circle of radius `r`; `angle` is the first vertex direction (radians). */
export interface PolygonEntity {
  id: string;
  type: 'polygon';
  c: Vec2;
  r: number;
  sides: number;
  angle: number;
}

export type SketchEntity = LineEntity | RectEntity | CircleEntity | ArcEntity | PolygonEntity;
export type SketchEntityType = SketchEntity['type'];

interface BaseObject {
  id: string;
  name: string;
  visible: boolean;
  transform: Transform;
}

export interface PrimitiveObject extends BaseObject {
  kind: 'primitive';
  shape: PrimitiveShape;
  params: Record<string, number>;
}

export interface SketchObject extends BaseObject {
  kind: 'sketch';
  plane: SketchPlane;
  /** Distance of the sketch plane from the origin along its normal (mm). */
  offset: number;
  entities: SketchEntity[];
}

export interface ExtrudeObject extends BaseObject {
  kind: 'extrude';
  plane: SketchPlane;
  offset: number;
  /** Snapshot of the sketch profile at extrusion time. */
  entities: SketchEntity[];
  /** Extrusion distance along the plane normal (mm); negative extrudes the other way. */
  distance: number;
  sourceSketchName: string;
}

export type CadObject = PrimitiveObject | SketchObject | ExtrudeObject | EnclosureObject;
export type SolidObject = PrimitiveObject | ExtrudeObject | EnclosureObject;

/** Thiele/Small data and physical size of one subwoofer driver. */
export interface DriverSpec {
  name: string;
  /** Resonance frequency (Hz). */
  fs: number;
  /** Total Q. */
  qts: number;
  /** Equivalent compliance volume (litres). */
  vas: number;
  /** Linear one-way excursion (mm). */
  xmax: number;
  /** Effective cone area (cm²). */
  sd: number;
  cutoutDiameter: number;
  outerDiameter: number;
  mountingDepth: number;
  /** Volume the driver itself takes up inside the box (litres). */
  displacement: number;
}

export type SlantSide = 'none' | 'front' | 'back';
export type EnclosureDim = 'width' | 'height' | 'depth';
export type BoxFace = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

/** A subwoofer mounted on one side of the box; `p` is its centre in that side's (u, v) coordinates (mm). */
export interface DriverMount {
  face: BoxFace;
  p: Vec2;
}

/** External box size (mm). Width is X, height is Y, depth (at the bottom) is Z. */
export interface EnclosureShape {
  width: number;
  height: number;
  depth: number;
  thickness: number;
  /** Which panel is angled; the front panel is the baffle the subwoofers mount on. */
  slant: SlantSide;
  /** Angle of the slanted panel from vertical (degrees). */
  slantAngle: number;
}

export interface EnclosureDesign {
  boxType: 'sealed' | 'ported';
  /** Target Qtc for sealed boxes. */
  qtc: number;
  /** Target net volume in litres; null = calculated from the driver data. */
  targetVolume: number | null;
  /** Port tuning in Hz; null = calculated from the driver data. */
  tuning: number | null;
  /** Keep the net volume on target by resizing `adjust` when other sizes change. */
  lockVolume: boolean;
  adjust: EnclosureDim;
  /** While true the program designs the shape; editing sizes by hand turns it off. */
  autoShape: boolean;
}

/**
 * Slot ports run along the bottom (full inner width) and fold up the back wall when
 * they are too long. Round ports are straight tubes through the baffle.
 */
export interface PortSpec {
  shape: 'slot' | 'round';
  /** Slot opening height (mm). */
  slotHeight: number;
  /** Round port inner diameter (mm). */
  diameter: number;
  /** Round port centres on the baffle (u, v) in mm. */
  positions: Vec2[];
  /** Port length along its centre line, including the baffle (mm). */
  length: number;
  autoLength: boolean;
}

export interface EnclosureObject extends BaseObject {
  kind: 'enclosure';
  shape: EnclosureShape;
  driver: DriverSpec;
  design: EnclosureDesign;
  /** Mounted subwoofers. On the front, u runs across the width and v up along the panel from its bottom edge. */
  drivers: DriverMount[];
  port: PortSpec;
  showInside: boolean;
}

export interface ProjectFile {
  format: 'minicad-project';
  version: 1;
  id: string;
  name: string;
  units: Units;
  objects: CadObject[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  objectCount: number;
}
