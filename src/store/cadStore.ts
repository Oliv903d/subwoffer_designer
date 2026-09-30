import { create } from 'zustand';
import type {
  CadObject,
  EnclosureDim,
  EnclosureObject,
  ExtrudeObject,
  PrimitiveObject,
  PrimitiveShape,
  ProjectFile,
  SketchEntity,
  SketchObject,
  SketchPlane,
  Transform,
  Units,
  Vec2,
} from '../types/cad';
import { createId } from '../utils/id';
import { PRIMITIVES } from '../geometry/primitives';
import { hasClosedProfile } from '../sketch/profiles';
import { autoDesign, finalizeEnclosure } from '../subwoofer/enclosure';
import { resizeFromFace, type Face } from '../subwoofer/faces';
import { DEFAULT_DRIVER } from '../subwoofer/presets';
import { emptyHistory, endCoalesce, record, redo, undo, type History } from './history';

export type Mode = 'model' | 'pickPlane' | 'sketch' | 'extrude';
export type TransformTool = 'select' | 'translate' | 'rotate' | 'scale';
export type SketchTool = 'select' | 'line' | 'rect' | 'circle' | 'arc' | 'polygon';
export type ViewName = 'home' | 'front' | 'top' | 'right' | 'fit';
export type Projection = 'perspective' | 'orthographic';
export type RightTab = 'properties' | 'subwoofer';

export interface Draft {
  points: Vec2[];
  /** First point of a line chain, used to close the chain. */
  chainStart: Vec2 | null;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

interface CadState {
  // Project
  projectId: string;
  projectName: string;
  units: Units;
  createdAt: number;
  dirty: boolean;

  // Document (undoable)
  objects: CadObject[];
  history: History<CadObject[]>;

  // Session UI state
  selectedId: string | null;
  hoveredId: string | null;
  mode: Mode;
  transformTool: TransformTool;
  projection: Projection;
  viewRequest: { name: ViewName; nonce: number } | null;

  activeSketchId: string | null;
  sketchTool: SketchTool;
  selectedEntityId: string | null;
  polygonSides: number;
  showDimensions: boolean;
  draft: Draft | null;
  cursor: Vec2 | null;

  extrude: { sketchId: string; distance: number } | null;
  lastExtrudeDistance: number;

  toast: Toast | null;

  // Subwoofer
  rightTab: RightTab;
  selectedFace: Face | null;
  setRightTab: (tab: RightTab) => void;
  setSelectedFace: (face: Face | null) => void;
  /** Selects the first subwoofer box, or designs a new one if there is none. */
  openSubwoofer: () => void;
  createEnclosure: () => void;
  /**
   * `redesign`: the change affects the acoustics (subwoofer data, box type, port); boxes whose
   * shape is still automatic are redesigned from scratch, others keep their shape.
   */
  updateEnclosure: (
    id: string,
    update: (o: EnclosureObject) => EnclosureObject,
    edited?: EnclosureDim | null,
    coalesceKey?: string,
    redesign?: boolean,
  ) => void;
  resizeFace: (id: string, face: Face, value: number, start: EnclosureObject, coalesceKey: string) => void;
  redesignEnclosure: (id: string) => void;
  // History
  undo: () => void;
  redo: () => void;
  endCoalesce: () => void;

  // Objects
  addPrimitive: (shape: PrimitiveShape) => void;
  updateObject: (id: string, update: (o: CadObject) => CadObject, coalesceKey?: string) => void;
  setTransform: (id: string, transform: Transform, coalesceKey?: string) => void;
  renameObject: (id: string, name: string) => void;
  toggleVisibility: (id: string) => void;
  deleteObject: (id: string) => void;
  duplicateObject: (id: string) => void;
  select: (id: string | null) => void;
  setHovered: (id: string | null) => void;

  // Viewport
  setTransformTool: (t: TransformTool) => void;
  setProjection: (p: Projection) => void;
  requestView: (name: ViewName) => void;

  // Sketch
  startNewSketch: () => void;
  cancelPickPlane: () => void;
  createSketch: (plane: SketchPlane) => void;
  editSketch: (id: string) => void;
  finishSketch: () => void;
  setSketchTool: (t: SketchTool) => void;
  setPolygonSides: (n: number) => void;
  toggleDimensions: () => void;
  setDraft: (d: Draft | null) => void;
  setCursor: (p: Vec2 | null) => void;
  addEntity: (e: SketchEntity) => void;
  updateEntities: (update: (entities: SketchEntity[]) => SketchEntity[], coalesceKey?: string) => void;
  deleteEntity: (id: string) => void;
  selectEntity: (id: string | null) => void;

  // Extrude
  findExtrudableSketch: () => SketchObject | null;
  startExtrude: (sketchId?: string) => void;
  setExtrudeDistance: (d: number) => void;
  confirmExtrude: () => void;
  cancelExtrude: () => void;

  // Project
  setUnits: (u: Units) => void;
  setProjectName: (name: string) => void;
  loadProject: (file: ProjectFile, opts?: { dirty?: boolean }) => void;
  newProject: () => void;
  toProjectFile: () => ProjectFile;
  markSaved: () => void;
  notify: (message: string, kind?: Toast['kind']) => void;
}

export function defaultTransform(): Transform {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

export function enclosureTemplate(): EnclosureObject {
  return {
    id: 'draft',
    name: 'Sub Box',
    visible: true,
    transform: defaultTransform(),
    kind: 'enclosure',
    shape: { width: 500, height: 400, depth: 400, thickness: 18, slant: 'none', slantAngle: 0 },
    driver: { ...DEFAULT_DRIVER },
    design: { boxType: 'ported', qtc: 0.707, targetVolume: null, tuning: null, lockVolume: true, adjust: 'depth', autoShape: true },
    drivers: [{ face: 'front', p: [0, 200] }],
    port: { shape: 'slot', slotHeight: 50, diameter: 100, positions: [], length: 300, autoLength: true },
    showInside: false,
  };
}

const BASE_NAMES: Record<string, string> = {
  sketch: 'Sketch',
  extrude: 'Extrude',
  enclosure: 'Sub Box',
  ...Object.fromEntries(Object.entries(PRIMITIVES).map(([k, d]) => [k, d.label])),
};

export function baseName(obj: CadObject): string {
  return obj.kind === 'primitive' ? BASE_NAMES[obj.shape] : BASE_NAMES[obj.kind];
}

function nextName(objects: CadObject[], base: string): string {
  const re = new RegExp(`^${base} (\\d+)$`);
  let max = 0;
  for (const o of objects) {
    const m = o.name.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${base} ${max + 1}`;
}

export function findSketch(objects: CadObject[], id: string | null): SketchObject | null {
  const o = id ? objects.find((x) => x.id === id) : undefined;
  return o && o.kind === 'sketch' ? o : null;
}

let toastCounter = 0;

export const useCad = create<CadState>()((set, get) => {
  /** Applies an undoable document change. */
  const commit = (mutate: (objects: CadObject[]) => CadObject[], coalesceKey?: string) => {
    const s = get();
    const next = mutate(s.objects);
    if (next === s.objects) return;
    set({ objects: next, history: record(s.history, s.objects, coalesceKey), dirty: true });
  };

  const mapObject = (id: string, fn: (o: CadObject) => CadObject) => (objects: CadObject[]) => {
    let changed = false;
    const next = objects.map((o) => {
      if (o.id !== id) return o;
      const n = fn(o);
      if (n !== o) changed = true;
      return n;
    });
    return changed ? next : objects;
  };

  /** Keeps session state consistent after the document was replaced (undo/redo/load). */
  const reconcile = (objects: CadObject[]): Partial<CadState> => {
    const s = get();
    const has = (id: string | null) => !!id && objects.some((o) => o.id === id);
    const patch: Partial<CadState> = {};
    if (!has(s.selectedId)) Object.assign(patch, { selectedId: null, selectedFace: null });
    if (!has(s.hoveredId)) patch.hoveredId = null;
    const sketch = findSketch(objects, s.activeSketchId);
    if (s.mode === 'sketch' && !sketch) {
      Object.assign(patch, { mode: 'model', activeSketchId: null, draft: null, selectedEntityId: null });
    } else if (sketch && !sketch.entities.some((e) => e.id === s.selectedEntityId)) {
      patch.selectedEntityId = null;
    }
    if (s.mode === 'extrude' && !findSketch(objects, s.extrude?.sketchId ?? null)) {
      Object.assign(patch, { mode: 'model', extrude: null });
    }
    return patch;
  };

  const updateActiveSketch = (fn: (s: SketchObject) => SketchObject, coalesceKey?: string) => {
    const id = get().activeSketchId;
    if (!id) return;
    commit(mapObject(id, (o) => (o.kind === 'sketch' ? fn(o) : o)), coalesceKey);
  };

  return {
    projectId: createId(),
    projectName: 'Untitled project',
    units: 'mm',
    createdAt: Date.now(),
    dirty: false,

    objects: [],
    history: emptyHistory(),

    selectedId: null,
    hoveredId: null,
    mode: 'model',
    transformTool: 'select',
    projection: 'perspective',
    viewRequest: null,

    activeSketchId: null,
    sketchTool: 'rect',
    selectedEntityId: null,
    polygonSides: 6,
    showDimensions: true,
    draft: null,
    cursor: null,

    extrude: null,
    lastExtrudeDistance: 20,

    toast: null,

    rightTab: 'properties',
    selectedFace: null,
    setRightTab: (rightTab) => set({ rightTab }),
    setSelectedFace: (selectedFace) => set(selectedFace ? { selectedFace, rightTab: 'subwoofer' } : { selectedFace }),

    openSubwoofer: () => {
      const s = get();
      if (s.mode !== 'model') return;
      const box = s.objects.find((o) => o.kind === 'enclosure');
      if (box) set({ selectedId: box.id, selectedFace: null, rightTab: 'subwoofer' });
      else s.createEnclosure();
    },

    createEnclosure: () => {
      const s = get();
      if (s.mode !== 'model') return;
      const obj = autoDesign({ ...enclosureTemplate(), id: createId(), name: nextName(s.objects, 'Sub Box') });
      commit((objs) => [...objs, obj]);
      set({
        selectedId: obj.id,
        selectedFace: null,
        rightTab: 'subwoofer',
        viewRequest: { name: 'home', nonce: (s.viewRequest?.nonce ?? 0) + 1 },
      });
    },

    updateEnclosure: (id, update, edited = null, coalesceKey, redesign = false) =>
      commit(
        mapObject(id, (o) => {
          if (o.kind !== 'enclosure') return o;
          const next = update(o);
          return redesign && next.design.autoShape ? autoDesign(next) : finalizeEnclosure(next, edited, o);
        }),
        coalesceKey,
      ),

    resizeFace: (id, face, value, start, coalesceKey) =>
      commit(
        mapObject(id, (o) => (o.kind === 'enclosure' ? resizeFromFace(start, face, value) : o)),
        coalesceKey,
      ),

    redesignEnclosure: (id) => commit(mapObject(id, (o) => (o.kind === 'enclosure' ? autoDesign(o) : o))),

    undo: () => {
      const s = get();
      const r = undo(s.history, s.objects);
      if (!r) return;
      set({ objects: r.value, history: r.history, dirty: true, draft: null, ...reconcile(r.value) });
    },
    redo: () => {
      const s = get();
      const r = redo(s.history, s.objects);
      if (!r) return;
      set({ objects: r.value, history: r.history, dirty: true, draft: null, ...reconcile(r.value) });
    },
    endCoalesce: () => set((s) => ({ history: endCoalesce(s.history) })),

    addPrimitive: (shape) => {
      const s = get();
      if (s.mode !== 'model') return;
      const def = PRIMITIVES[shape];
      const obj: PrimitiveObject = {
        id: createId(),
        name: nextName(s.objects, def.label),
        visible: true,
        transform: defaultTransform(),
        kind: 'primitive',
        shape,
        params: { ...def.defaults },
      };
      commit((objs) => [...objs, obj]);
      set({ selectedId: obj.id });
    },

    updateObject: (id, update, coalesceKey) => commit(mapObject(id, update), coalesceKey),

    setTransform: (id, transform, coalesceKey) =>
      commit(
        mapObject(id, (o) => ({ ...o, transform })),
        coalesceKey,
      ),

    renameObject: (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      commit(mapObject(id, (o) => (o.name === trimmed ? o : { ...o, name: trimmed })));
    },

    toggleVisibility: (id) => commit(mapObject(id, (o) => ({ ...o, visible: !o.visible }))),

    deleteObject: (id) => {
      const s = get();
      if (!s.objects.some((o) => o.id === id)) return;
      commit((objs) => objs.filter((o) => o.id !== id));
      set(reconcile(get().objects));
    },

    duplicateObject: (id) => {
      const s = get();
      const src = s.objects.find((o) => o.id === id);
      if (!src || s.mode !== 'model') return;
      const [x, y, z] = src.transform.position;
      const copy: CadObject = {
        ...structuredClone(src),
        id: createId(),
        name: nextName(s.objects, baseName(src)),
        transform: { ...structuredClone(src.transform), position: [x + 20, y, z] },
      };
      if (copy.kind === 'sketch') copy.offset += 20;
      commit((objs) => [...objs, copy]);
      set({ selectedId: copy.id });
    },

    select: (id) => set({ selectedId: id, selectedFace: null }),
    setHovered: (id) => set((s) => (s.hoveredId === id ? s : { hoveredId: id })),

    setTransformTool: (transformTool) => set({ transformTool }),
    setProjection: (projection) => set({ projection }),
    requestView: (name) => set((s) => ({ viewRequest: { name, nonce: (s.viewRequest?.nonce ?? 0) + 1 } })),

    startNewSketch: () => {
      if (get().mode !== 'model') return;
      set({ mode: 'pickPlane', selectedId: null });
    },
    cancelPickPlane: () => set((s) => (s.mode === 'pickPlane' ? { mode: 'model' } : s)),

    createSketch: (plane) => {
      const s = get();
      const sketch: SketchObject = {
        id: createId(),
        name: nextName(s.objects, 'Sketch'),
        visible: true,
        transform: defaultTransform(),
        kind: 'sketch',
        plane,
        offset: 0,
        entities: [],
      };
      commit((objs) => [...objs, sketch]);
      set({
        mode: 'sketch',
        activeSketchId: sketch.id,
        selectedId: sketch.id,
        selectedEntityId: null,
        sketchTool: 'rect',
        draft: null,
      });
    },

    editSketch: (id) => {
      const s = get();
      const sketch = findSketch(s.objects, id);
      if (!sketch || (s.mode !== 'model' && s.mode !== 'sketch')) return;
      if (!sketch.visible) commit(mapObject(id, (o) => ({ ...o, visible: true })));
      set({
        mode: 'sketch',
        activeSketchId: id,
        selectedId: id,
        selectedEntityId: null,
        sketchTool: 'select',
        draft: null,
      });
    },

    finishSketch: () => {
      const s = get();
      const sketch = findSketch(s.objects, s.activeSketchId);
      if (sketch && sketch.entities.length === 0) {
        commit((objs) => objs.filter((o) => o.id !== sketch.id));
      }
      set({
        mode: 'model',
        activeSketchId: null,
        selectedEntityId: null,
        draft: null,
        cursor: null,
        selectedId: sketch && sketch.entities.length > 0 ? sketch.id : null,
      });
    },

    setSketchTool: (sketchTool) => set({ sketchTool, draft: null }),
    setPolygonSides: (n) => set({ polygonSides: Math.max(3, Math.min(64, Math.round(n))) }),
    toggleDimensions: () => set((s) => ({ showDimensions: !s.showDimensions })),
    setDraft: (draft) => set({ draft }),
    setCursor: (cursor) => set({ cursor }),

    addEntity: (e) => updateActiveSketch((sk) => ({ ...sk, entities: [...sk.entities, e] })),

    updateEntities: (update, coalesceKey) =>
      updateActiveSketch((sk) => {
        const entities = update(sk.entities);
        return entities === sk.entities ? sk : { ...sk, entities };
      }, coalesceKey),

    deleteEntity: (id) => {
      updateActiveSketch((sk) => ({ ...sk, entities: sk.entities.filter((e) => e.id !== id) }));
      if (get().selectedEntityId === id) set({ selectedEntityId: null });
    },

    selectEntity: (selectedEntityId) => set({ selectedEntityId }),

    findExtrudableSketch: () => {
      const s = get();
      const preferred = findSketch(s.objects, s.mode === 'sketch' ? s.activeSketchId : s.selectedId);
      if (preferred) return hasClosedProfile(preferred.entities) ? preferred : null;
      const candidates = s.objects.filter(
        (o): o is SketchObject => o.kind === 'sketch' && o.visible && hasClosedProfile(o.entities),
      );
      return candidates[candidates.length - 1] ?? null;
    },

    startExtrude: (sketchId) => {
      const s = get();
      const sketch = sketchId ? findSketch(s.objects, sketchId) : s.findExtrudableSketch();
      if (!sketch || !hasClosedProfile(sketch.entities)) {
        s.notify('Select a sketch with a closed profile to extrude.', 'error');
        return;
      }
      if (s.mode === 'sketch') s.finishSketch();
      set({
        mode: 'extrude',
        extrude: { sketchId: sketch.id, distance: get().lastExtrudeDistance },
        selectedId: sketch.id,
        transformTool: 'select',
      });
    },

    setExtrudeDistance: (distance) =>
      set((s) => (s.extrude ? { extrude: { ...s.extrude, distance } } : s)),

    confirmExtrude: () => {
      const s = get();
      const sketch = findSketch(s.objects, s.extrude?.sketchId ?? null);
      if (!s.extrude || !sketch || Math.abs(s.extrude.distance) < 1e-6) return;
      const obj: ExtrudeObject = {
        id: createId(),
        name: nextName(s.objects, 'Extrude'),
        visible: true,
        transform: defaultTransform(),
        kind: 'extrude',
        plane: sketch.plane,
        offset: sketch.offset,
        entities: structuredClone(sketch.entities),
        distance: s.extrude.distance,
        sourceSketchName: sketch.name,
      };
      commit((objs) => [...objs.map((o) => (o.id === sketch.id ? { ...o, visible: false } : o)), obj]);
      set({ mode: 'model', extrude: null, selectedId: obj.id, lastExtrudeDistance: s.extrude.distance });
    },

    cancelExtrude: () => set({ mode: 'model', extrude: null }),

    setUnits: (units) => set({ units, dirty: true }),
    setProjectName: (name) => {
      const trimmed = name.trim();
      if (trimmed && trimmed !== get().projectName) set({ projectName: trimmed, dirty: true });
    },

    loadProject: (file, opts) =>
      set({
        projectId: file.id,
        projectName: file.name,
        units: file.units,
        createdAt: file.createdAt,
        objects: file.objects,
        history: emptyHistory(),
        dirty: opts?.dirty ?? false,
        selectedId: null,
        hoveredId: null,
        mode: 'model',
        activeSketchId: null,
        selectedEntityId: null,
        draft: null,
        extrude: null,
        transformTool: 'select',
        viewRequest: { name: 'fit', nonce: (get().viewRequest?.nonce ?? 0) + 1 },
      }),

    newProject: () =>
      get().loadProject({
        format: 'minicad-project',
        version: 1,
        id: createId(),
        name: 'Untitled project',
        units: get().units,
        objects: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),

    toProjectFile: () => {
      const s = get();
      return {
        format: 'minicad-project',
        version: 1,
        id: s.projectId,
        name: s.projectName,
        units: s.units,
        objects: s.objects,
        createdAt: s.createdAt,
        updatedAt: Date.now(),
      };
    },

    markSaved: () => set({ dirty: false }),

    notify: (message, kind = 'info') => set({ toast: { id: ++toastCounter, message, kind } }),
  };
});

export function useSelectedObject(): CadObject | null {
  return useCad((s) => s.objects.find((o) => o.id === s.selectedId) ?? null);
}

export function useActiveSketch(): SketchObject | null {
  return useCad((s) => findSketch(s.objects, s.activeSketchId));
}
