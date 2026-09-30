import type {
  CadObject,
  DriverMount,
  EnclosureObject,
  ProjectFile,
  ProjectSummary,
  SketchEntity,
  Transform,
  Units,
  Vec2,
  Vec3,
} from '../types/cad';
import { PRIMITIVES } from '../geometry/primitives';

const INDEX_KEY = 'minicad.projects.v1';
const PROJECT_PREFIX = 'minicad.project.';
const LAST_KEY = 'minicad.lastProjectId';

function readIndex(): ProjectSummary[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ProjectSummary[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(index: ProjectSummary[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function listProjects(): ProjectSummary[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Saves a project; throws if storage is unavailable or full. */
export function saveProject(file: ProjectFile): void {
  localStorage.setItem(PROJECT_PREFIX + file.id, JSON.stringify(file));
  const summary: ProjectSummary = {
    id: file.id,
    name: file.name,
    updatedAt: file.updatedAt,
    objectCount: file.objects.length,
  };
  writeIndex([...readIndex().filter((p) => p.id !== file.id), summary]);
  localStorage.setItem(LAST_KEY, file.id);
}

export function loadProject(id: string): ProjectFile | null {
  const raw = localStorage.getItem(PROJECT_PREFIX + id);
  if (!raw) return null;
  try {
    return parseProjectJson(raw);
  } catch {
    return null;
  }
}

export function deleteProject(id: string): void {
  localStorage.removeItem(PROJECT_PREFIX + id);
  writeIndex(readIndex().filter((p) => p.id !== id));
  if (localStorage.getItem(LAST_KEY) === id) localStorage.removeItem(LAST_KEY);
}

export function renameProject(id: string, name: string): void {
  const file = loadProject(id);
  if (!file) return;
  saveProject({ ...file, name, updatedAt: Date.now() });
}

export function getLastProjectId(): string | null {
  return localStorage.getItem(LAST_KEY);
}

export function setLastProjectId(id: string): void {
  localStorage.setItem(LAST_KEY, id);
}

// ---------------------------------------------------------------------------
// Validation of untrusted JSON (imports and stored data)
// ---------------------------------------------------------------------------

class InvalidProjectError extends Error {}

function fail(msg: string): never {
  throw new InvalidProjectError(`Invalid project file: ${msg}`);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} must be a number`);
  return v;
}

function str(v: unknown, what: string, max = 200): string {
  if (typeof v !== 'string') fail(`${what} must be a string`);
  return v.slice(0, max);
}

function vec2(v: unknown, what: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2) fail(`${what} must be [x, y]`);
  return [num(v[0], what), num(v[1], what)];
}

function vec3(v: unknown, what: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) fail(`${what} must be [x, y, z]`);
  return [num(v[0], what), num(v[1], what), num(v[2], what)];
}

function transform(v: unknown): Transform {
  if (!isObj(v)) fail('transform missing');
  return {
    position: vec3(v.position, 'position'),
    rotation: vec3(v.rotation, 'rotation'),
    scale: vec3(v.scale, 'scale'),
  };
}

function plane(v: unknown) {
  if (v !== 'XY' && v !== 'XZ' && v !== 'YZ') fail('unknown sketch plane');
  return v;
}

function entity(v: unknown): SketchEntity {
  if (!isObj(v)) fail('sketch entity must be an object');
  const id = str(v.id, 'entity id', 64);
  switch (v.type) {
    case 'line':
      return { id, type: 'line', a: vec2(v.a, 'line.a'), b: vec2(v.b, 'line.b') };
    case 'rect':
      return { id, type: 'rect', x: num(v.x, 'rect.x'), y: num(v.y, 'rect.y'), w: num(v.w, 'rect.w'), h: num(v.h, 'rect.h') };
    case 'circle':
      return { id, type: 'circle', c: vec2(v.c, 'circle.c'), r: num(v.r, 'circle.r') };
    case 'arc':
      return {
        id,
        type: 'arc',
        c: vec2(v.c, 'arc.c'),
        r: num(v.r, 'arc.r'),
        start: num(v.start, 'arc.start'),
        end: num(v.end, 'arc.end'),
      };
    case 'polygon': {
      const sides = Math.round(num(v.sides, 'polygon.sides'));
      if (sides < 3 || sides > 64) fail('polygon sides must be 3–64');
      return { id, type: 'polygon', c: vec2(v.c, 'polygon.c'), r: num(v.r, 'polygon.r'), sides, angle: num(v.angle, 'polygon.angle') };
    }
    default:
      fail('unknown sketch entity type');
  }
}

function entities(v: unknown): SketchEntity[] {
  if (!Array.isArray(v)) fail('entities must be an array');
  return v.map(entity);
}

function cadObject(v: unknown): CadObject {
  if (!isObj(v)) fail('object entry must be an object');
  const base = {
    id: str(v.id, 'object id', 64),
    name: str(v.name, 'object name', 100),
    visible: v.visible !== false,
    transform: transform(v.transform),
  };
  switch (v.kind) {
    case 'primitive': {
      const shape = v.shape;
      if (typeof shape !== 'string' || !(shape in PRIMITIVES)) fail('unknown primitive shape');
      const def = PRIMITIVES[shape as keyof typeof PRIMITIVES];
      if (!isObj(v.params)) fail('primitive params missing');
      const params: Record<string, number> = {};
      for (const p of def.params) params[p.key] = num(v.params[p.key], p.key);
      return { ...base, kind: 'primitive', shape: shape as keyof typeof PRIMITIVES, params };
    }
    case 'sketch':
      return { ...base, kind: 'sketch', plane: plane(v.plane), offset: num(v.offset, 'offset'), entities: entities(v.entities) };
    case 'extrude':
      return {
        ...base,
        kind: 'extrude',
        plane: plane(v.plane),
        offset: num(v.offset, 'offset'),
        entities: entities(v.entities),
        distance: num(v.distance, 'distance'),
        sourceSketchName: typeof v.sourceSketchName === 'string' ? v.sourceSketchName.slice(0, 100) : '',
      };
    case 'enclosure':
      return { ...base, ...enclosure(v) };
    default:
      fail('unknown object kind');
  }
}

function oneOf<T extends string>(v: unknown, options: readonly T[], what: string): T {
  if (!options.includes(v as T)) fail(`${what} must be one of ${options.join(', ')}`);
  return v as T;
}

function positive(v: unknown, what: string): number {
  const n = num(v, what);
  if (n <= 0) fail(`${what} must be positive`);
  return n;
}

function driverMount(v: unknown): DriverMount {
  // Older files stored only the front-panel position.
  if (Array.isArray(v)) return { face: 'front', p: vec2(v, 'driver position') };
  if (!isObj(v)) fail('driver mount invalid');
  return {
    face: oneOf(v.face, ['front', 'back', 'top', 'bottom', 'left', 'right'] as const, 'driver side'),
    p: vec2(v.p, 'driver position'),
  };
}

function enclosure(v: Record<string, unknown>): Omit<EnclosureObject, 'id' | 'name' | 'visible' | 'transform'> {
  const { shape, driver, design, port } = v;
  if (!isObj(shape) || !isObj(driver) || !isObj(design) || !isObj(port)) fail('enclosure data missing');
  if (!Array.isArray(v.drivers) || v.drivers.length > 8) fail('enclosure drivers invalid');
  if (!Array.isArray(port.positions) || port.positions.length > 8) fail('port positions invalid');
  const optional = (x: unknown, what: string) => (x === null ? null : positive(x, what));
  return {
    kind: 'enclosure',
    shape: {
      width: positive(shape.width, 'width'),
      height: positive(shape.height, 'height'),
      depth: positive(shape.depth, 'depth'),
      thickness: positive(shape.thickness, 'thickness'),
      slant: oneOf(shape.slant, ['none', 'front', 'back'] as const, 'slant'),
      slantAngle: num(shape.slantAngle, 'slantAngle'),
    },
    driver: {
      name: str(driver.name, 'driver name', 100),
      fs: positive(driver.fs, 'fs'),
      qts: positive(driver.qts, 'qts'),
      vas: positive(driver.vas, 'vas'),
      xmax: positive(driver.xmax, 'xmax'),
      sd: positive(driver.sd, 'sd'),
      cutoutDiameter: positive(driver.cutoutDiameter, 'cutoutDiameter'),
      outerDiameter: positive(driver.outerDiameter, 'outerDiameter'),
      mountingDepth: positive(driver.mountingDepth, 'mountingDepth'),
      displacement: num(driver.displacement, 'displacement'),
    },
    design: {
      boxType: oneOf(design.boxType, ['sealed', 'ported'] as const, 'boxType'),
      qtc: positive(design.qtc, 'qtc'),
      targetVolume: optional(design.targetVolume, 'targetVolume'),
      tuning: optional(design.tuning, 'tuning'),
      lockVolume: design.lockVolume === true,
      adjust: oneOf(design.adjust, ['width', 'height', 'depth'] as const, 'adjust'),
      autoShape: design.autoShape !== false,
    },
    drivers: v.drivers.map(driverMount),
    port: {
      shape: oneOf(port.shape, ['slot', 'round'] as const, 'port shape'),
      slotHeight: positive(port.slotHeight, 'slotHeight'),
      diameter: positive(port.diameter, 'port diameter'),
      positions: port.positions.map((p) => vec2(p, 'port position')),
      length: positive(port.length, 'port length'),
      autoLength: port.autoLength !== false,
    },
    showInside: v.showInside === true,
  };
}

/** Parses and validates a project JSON string. Throws with a readable message on failure. */
export function parseProjectJson(json: string): ProjectFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    fail('not valid JSON');
  }
  if (!isObj(data) || data.format !== 'minicad-project') fail('not a MiniCAD project');
  if (data.version !== 1) fail('unsupported version');
  if (!Array.isArray(data.objects)) fail('objects missing');
  const units: Units = data.units === 'cm' || data.units === 'in' ? data.units : 'mm';
  const objects = data.objects.map(cadObject);
  const ids = new Set(objects.map((o) => o.id));
  if (ids.size !== objects.length) fail('duplicate object ids');
  return {
    format: 'minicad-project',
    version: 1,
    id: str(data.id, 'project id', 64),
    name: str(data.name, 'project name', 100) || 'Untitled project',
    units,
    objects,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
  };
}
