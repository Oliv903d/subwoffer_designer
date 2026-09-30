import * as THREE from 'three';
import type { PrimitiveShape } from '../types/cad';

export interface ParamDef {
  key: string;
  label: string;
  min: number;
}

export interface PrimitiveDef {
  label: string;
  params: ParamDef[];
  defaults: Record<string, number>;
}

export const PRIMITIVES: Record<PrimitiveShape, PrimitiveDef> = {
  box: {
    label: 'Box',
    params: [
      { key: 'width', label: 'Width', min: 0.01 },
      { key: 'depth', label: 'Depth', min: 0.01 },
      { key: 'height', label: 'Height', min: 0.01 },
    ],
    defaults: { width: 50, depth: 30, height: 20 },
  },
  cylinder: {
    label: 'Cylinder',
    params: [
      { key: 'radius', label: 'Radius', min: 0.01 },
      { key: 'height', label: 'Height', min: 0.01 },
    ],
    defaults: { radius: 20, height: 40 },
  },
  sphere: {
    label: 'Sphere',
    params: [{ key: 'radius', label: 'Radius', min: 0.01 }],
    defaults: { radius: 25 },
  },
  cone: {
    label: 'Cone',
    params: [
      { key: 'radius', label: 'Base radius', min: 0.01 },
      { key: 'height', label: 'Height', min: 0.01 },
    ],
    defaults: { radius: 20, height: 40 },
  },
  tube: {
    label: 'Tube',
    params: [
      { key: 'outerRadius', label: 'Outer radius', min: 0.02 },
      { key: 'innerRadius', label: 'Inner radius', min: 0.01 },
      { key: 'height', label: 'Height', min: 0.01 },
    ],
    defaults: { outerRadius: 25, innerRadius: 20, height: 40 },
  },
};

export const PRIMITIVE_SHAPES = Object.keys(PRIMITIVES) as PrimitiveShape[];

const SEGMENTS = 64;

function param(params: Record<string, number>, key: string, fallback: number): number {
  const v = params[key];
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Builds a primitive whose base sits on the XZ ground plane at the local origin. */
export function buildPrimitiveGeometry(
  shape: PrimitiveShape,
  params: Record<string, number>,
): THREE.BufferGeometry {
  const d = PRIMITIVES[shape].defaults;
  switch (shape) {
    case 'box': {
      const w = param(params, 'width', d.width);
      const dp = param(params, 'depth', d.depth);
      const h = param(params, 'height', d.height);
      return new THREE.BoxGeometry(w, h, dp).translate(0, h / 2, 0);
    }
    case 'cylinder': {
      const r = param(params, 'radius', d.radius);
      const h = param(params, 'height', d.height);
      return new THREE.CylinderGeometry(r, r, h, SEGMENTS).translate(0, h / 2, 0);
    }
    case 'sphere': {
      const r = param(params, 'radius', d.radius);
      return new THREE.SphereGeometry(r, SEGMENTS, SEGMENTS / 2).translate(0, r, 0);
    }
    case 'cone': {
      const r = param(params, 'radius', d.radius);
      const h = param(params, 'height', d.height);
      return new THREE.CylinderGeometry(0, r, h, SEGMENTS).translate(0, h / 2, 0);
    }
    case 'tube': {
      const ro = param(params, 'outerRadius', d.outerRadius);
      const h = param(params, 'height', d.height);
      // Keep the wall valid even if the user enters an inner radius >= outer radius.
      const ri = Math.min(param(params, 'innerRadius', d.innerRadius), ro * 0.99);
      const shapePath = new THREE.Shape().absarc(0, 0, ro, 0, Math.PI * 2, false);
      shapePath.holes.push(new THREE.Path().absarc(0, 0, ri, 0, Math.PI * 2, true));
      const geo = new THREE.ExtrudeGeometry(shapePath, {
        depth: h,
        bevelEnabled: false,
        curveSegments: SEGMENTS,
      });
      return geo.rotateX(-Math.PI / 2);
    }
  }
}
