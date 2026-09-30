import type { Units } from '../types/cad';
import { round } from '../utils/units';

export const LITRES_PER_FT3 = 28.3168;

/** Litres for metric units, cubic feet for inches. */
export function formatVolume(litres: number, units: Units): string {
  return units === 'in' ? `${round(litres / LITRES_PER_FT3, 2)} ft³` : `${round(litres, 1)} L`;
}

/** cm² for metric units, in² for inches. */
export function formatArea(mm2: number, units: Units): string {
  return units === 'in' ? `${round(mm2 / 645.16, 1)} in²` : `${round(mm2 / 100, 1)} cm²`;
}
