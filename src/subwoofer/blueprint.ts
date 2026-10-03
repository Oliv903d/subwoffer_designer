import type { EnclosureObject, Vec2 } from '../types/cad';
import { cutList, innerWidth, insetPolygon, isPorted, outerProfile, slotPath, topDepth } from './enclosure';

export interface BlueprintPiece {
  name: string;
  qty: number;
  width: number;
  height: number;
  note?: string;
  /** Outline normalised to the piece's bounding rectangle, not a full-size template. */
  outline: Vec2[];
}

export interface CutBlueprint {
  designName: string;
  thickness: number;
  pieces: BlueprintPiece[];
}

export type BlueprintResult = { blueprint: CutBlueprint; error?: never } | { blueprint?: never; error: string };

const rectangle: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const positive = (n: number) => Number.isFinite(n) && n > 0;
const invalid = (error: string): BlueprintResult => ({ error });

/** Uses the same panel sizes and joint convention as the enclosure's existing cut list. */
export function deriveCutBlueprint(o: EnclosureObject): BlueprintResult {
  const s = o.shape;
  if (![s.width, s.height, s.depth, s.thickness].every(positive) ||
      !Number.isFinite(s.slantAngle) || s.slantAngle < 0 || s.slantAngle > 60) {
    return invalid('Enter finite, positive box dimensions and material thickness, and an angle from 0° to 60°.');
  }
  if (!['none', 'front', 'back'].includes(s.slant) ||
      !['sealed', 'ported'].includes(o.design.boxType)) {
    return invalid('Choose a valid box type and slanted side before generating a blueprint.');
  }
  const inside = insetPolygon(outerProfile(s), s.thickness);
  if (innerWidth(s) <= 0 || s.height <= 2 * s.thickness || topDepth(s) <= 0 ||
      inside[1].z <= inside[0].z || inside[2].z <= inside[3].z) {
    return invalid('The material thickness leaves no usable interior. Increase the box size or reduce the thickness/angle.');
  }
  if (o.drivers.length > 0 && !positive(o.driver.cutoutDiameter)) {
    return invalid('Enter a finite, positive subwoofer cutout diameter.');
  }
  if (isPorted(o)) {
    if (!positive(o.port.length) || !['slot', 'round'].includes(o.port.shape)) {
      return invalid('Enter a finite, positive port length and choose a port shape.');
    }
    if (o.port.shape === 'slot') {
      if (!positive(o.port.slotHeight) || o.port.slotHeight + 2 * s.thickness >= s.height) {
        return invalid('Enter a positive slot height that fits inside the box.');
      }
      const path = slotPath(o, o.port.length);
      if (!path.fits || path.shelfZ1 <= path.shelfZ0) {
        return invalid('The slot port does not fit inside the box. Adjust the port length or box size before cutting.');
      }
    } else if (!positive(o.port.diameter) || o.port.positions.length === 0) {
      return invalid('Enter a finite, positive port diameter and add at least one round port.');
    }
  }

  const pieces = cutList(o).flatMap((panel): BlueprintPiece[] => {
    if (panel.name !== 'Side') {
      return [{ name: panel.name, qty: panel.qty, width: panel.a, height: panel.b, note: panel.note, outline: rectangle }];
    }
    const outline: Vec2[] = outerProfile(s).map((p) => [(p.z + s.depth / 2) / s.depth, 1 - p.y / s.height]);
    return (['left', 'right'] as const).map((side) => {
      const holes = o.drivers.filter((m) => m.face === side).length;
      const note = [
        s.slant !== 'none' && `Top depth ${topDepth(s)} mm; ${s.slant} slope ${s.slantAngle}° from vertical`,
        holes > 0 && `${holes}× Ø${o.driver.cutoutDiameter} mm cutout`,
      ].filter(Boolean).join('; ') || undefined;
      return { name: `${side === 'left' ? 'Left' : 'Right'} side`, qty: 1, width: panel.b, height: panel.a, note, outline };
    });
  });
  if (pieces.some((p) => !positive(p.width) || !positive(p.height) || !Number.isInteger(p.qty) || p.qty <= 0 ||
      p.outline.some((point) => point.some((n) => !Number.isFinite(n) || n < 0 || n > 1)))) {
    return invalid('The design produced an invalid cut size. Check the box and port dimensions before generating a blueprint.');
  }
  return { blueprint: { designName: o.name, thickness: s.thickness, pieces } };
}
