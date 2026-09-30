import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { CadObject, ProjectFile } from '../types/cad';
import { applyTransform, buildObjectGeometry } from '../geometry/buildGeometry';
import { downloadBlob, safeFileName } from './download';

/**
 * Exports all visible solids as a binary STL in millimetres.
 * The model is converted from the Y-up viewport to Z-up, which slicers expect.
 * Returns the number of exported solids.
 */
export function exportStl(objects: CadObject[], name: string): number {
  const root = new THREE.Group();
  root.rotation.x = Math.PI / 2;
  const geometries: THREE.BufferGeometry[] = [];

  for (const obj of objects) {
    if (!obj.visible || obj.kind === 'sketch') continue;
    const geo = buildObjectGeometry(obj);
    if (!geo) continue;
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo);
    applyTransform(mesh, obj.transform);
    root.add(mesh);
  }

  if (geometries.length > 0) {
    root.updateMatrixWorld(true);
    const data = new STLExporter().parse(root, { binary: true });
    downloadBlob(new Blob([data], { type: 'model/stl' }), `${safeFileName(name)}.stl`);
  }
  geometries.forEach((g) => g.dispose());
  return geometries.length;
}

export function exportProjectJson(file: ProjectFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${safeFileName(file.name)}.minicad.json`);
}
