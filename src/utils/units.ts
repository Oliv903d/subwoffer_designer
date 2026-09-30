import type { Units } from '../types/cad';

export const UNIT_FACTOR: Record<Units, number> = { mm: 1, cm: 10, in: 25.4 };
export const UNIT_LABEL: Record<Units, string> = { mm: 'mm', cm: 'cm', in: 'in' };

const UNIT_ALIASES: Record<string, Units> = {
  mm: 'mm',
  cm: 'cm',
  in: 'in',
  inch: 'in',
  inches: 'in',
  '"': 'in',
};

export function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function digitsFor(units: Units): number {
  return units === 'mm' ? 2 : units === 'cm' ? 3 : 4;
}

/** Converts a millimetre value to the display unit (rounded for display). */
export function toDisplay(mm: number, units: Units): number {
  return round(mm / UNIT_FACTOR[units], digitsFor(units));
}

export function formatLength(mm: number, units: Units): string {
  return `${toDisplay(mm, units)} ${UNIT_LABEL[units]}`;
}

export function formatNumber(value: number, digits = 2): string {
  return String(round(value, digits));
}

/**
 * Parses text such as "50", "50 mm", "2.5in" or "3 cm" into millimetres.
 * A bare number is interpreted in the current display unit.
 */
export function parseLength(text: string, units: Units): number | null {
  const m = text.trim().match(/^(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)\s*(mm|cm|inches|inch|in|")?$/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = m[2] ? UNIT_ALIASES[m[2].toLowerCase()] : units;
  return value * UNIT_FACTOR[unit];
}

export function parsePlainNumber(text: string): number | null {
  const m = text.trim().match(/^-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?\s*°?$/i);
  if (!m) return null;
  const value = parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

/** Returns a "nice" step (1, 2 or 5 × 10^n) that is >= value. */
export function niceStep(value: number): number {
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  for (const m of [1, 2, 5, 10]) {
    if (base * m >= value) return base * m;
  }
  return base * 10;
}
