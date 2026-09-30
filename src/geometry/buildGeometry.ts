import * as THREE from 'three';
import type { CadObject, SketchEntity, SketchPlane, Transform } from '../types/cad';
import { buildPrimitiveGeometry } from './primitives';
import { planeMatrix } from './planes';
import { sketchShapes } from '../sketch/profiles';
import { buildEnclosureGeometry } from '../subwoofer/enclosureGeometry';

export function buildExtrudeGeometry(
  plane: SketchPlane,
  offset: number,
  entities: SketchEntity[],
  distance: number,
): THREE.BufferGeometry | null {
  const shapes = sketchShapes(entities);
  if (shapes.length === 0 || Math.abs(distance) < 1e-6) return null;
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: Math.abs(distance), bevelEnabled: false });
  if (distance < 0) geo.translate(0, 0, distance);
  geo.applyMatrix4(planeMatrix(plane, offset));
  geo.computeVertexNormals();
  return geo;
}

/** Geometry for solid objects; sketches have no solid geometry. */
export function buildObjectGeometry(obj: CadObject): THREE.BufferGeometry | null {
  if (obj.kind === 'primitive') return buildPrimitiveGeometry(obj.shape, obj.params);
  if (obj.kind === 'extrude') return buildExtrudeGeometry(obj.plane, obj.offset, obj.entities, obj.distance);
  if (obj.kind === 'enclosure') return buildEnclosureGeometry(obj);
  return null;
}

/** A stable key that changes only when an object's geometry changes. */
export function geometryKey(obj: CadObject): string {
  if (obj.kind === 'primitive') return `${obj.shape}:${JSON.stringify(obj.params)}`;
  if (obj.kind === 'extrude') return `${obj.plane}:${obj.offset}:${obj.distance}:${JSON.stringify(obj.entities)}`;
  if (obj.kind === 'enclosure')
    return JSON.stringify([obj.shape, obj.drivers, obj.port, obj.driver.cutoutDiameter, obj.design.boxType]);
  return '';
}

const DEG = Math.PI / 180;

export function applyTransform(object: THREE.Object3D, t: Transform): void {
  object.position.set(...t.position);
  object.rotation.set(t.rotation[0] * DEG, t.rotation[1] * DEG, t.rotation[2] * DEG);
  object.scale.set(...t.scale);
}

export function degToRad(v: number): number {
  return v * DEG;
}

export function radToDeg(v: number): number {
  return v / DEG;
}
