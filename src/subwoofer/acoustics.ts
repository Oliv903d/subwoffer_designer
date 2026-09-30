import type { DriverSpec } from '../types/cad';

/** Speed of sound (m/s). */
export const SPEED_OF_SOUND = 343;
/** Port air speed above which audible port noise ("chuffing") becomes likely (m/s). */
export const MAX_PORT_VELOCITY = 17;
/** Car-audio rule of thumb: about 12 in² of port area per ft³ of box (≈ 2.73 cm² per litre). */
const PORT_AREA_PER_LITRE_MM2 = 273.4;
/** End correction factor for a port with one flanged end, times the equivalent diameter. */
const END_CORRECTION = 0.732;

export interface Alignment {
  /** Net box volume (litres) or null when the driver is unsuitable. */
  vb: number | null;
  /** Port tuning (ported) or system resonance (sealed), Hz. */
  f: number | null;
  /** Approximate -3 dB frequency (Hz). */
  f3: number | null;
  note?: string;
}

/** Sealed alignment for a target Qtc (0.707 = maximally flat). */
export function sealedAlignment(d: DriverSpec, count: number, qtc: number): Alignment {
  const ratio = (qtc / d.qts) ** 2 - 1;
  if (!(ratio > 0)) {
    return { vb: null, f: null, f3: null, note: `Qts ${d.qts} is too high for a sealed box with Qtc ${qtc}.` };
  }
  const fc = (d.fs * qtc) / d.qts;
  const a = 1 / (2 * qtc * qtc) - 1;
  return { vb: (d.vas * count) / ratio, f: fc, f3: fc * Math.sqrt(a + Math.sqrt(a * a + 1)) };
}

/** Classic vented alignment (Keele's approximations). */
export function portedAlignment(d: DriverSpec, count: number): Alignment {
  return {
    vb: 15 * d.vas * count * d.qts ** 2.87,
    f: 0.42 * d.fs * d.qts ** -0.9,
    f3: 0.26 * d.fs * d.qts ** -1.4,
  };
}

/** Smallest port area (mm²) that avoids port noise at full excursion: Sv ≥ 0.8 · Fb · Vd (Small). */
export function minPortArea(d: DriverSpec, count: number, fb: number): number {
  const vd = (d.sd / 1e4) * (d.xmax / 1000) * count;
  return 0.8 * fb * vd * 1e6;
}

/** Comfortable port area (mm²): the minimum or the car-audio rule of thumb, whichever is bigger. */
export function recommendedPortArea(d: DriverSpec, count: number, vbLitres: number, fb: number): number {
  return Math.max(minPortArea(d, count, fb), PORT_AREA_PER_LITRE_MM2 * vbLitres);
}

/** Estimated peak port air speed at full excursion (m/s), scaled from the minimum-area limit. */
export function portVelocity(d: DriverSpec, count: number, fb: number, areaMm2: number): number {
  if (areaMm2 <= 0) return Infinity;
  return (MAX_PORT_VELOCITY * minPortArea(d, count, fb)) / areaMm2;
}

function endCorrection(areaMm2: number, count: number): number {
  const single = areaMm2 / Math.max(1, count);
  return END_CORRECTION * 2 * Math.sqrt(single / Math.PI);
}

/** Physical port length (mm) for a tuning frequency. `areaMm2` is the total area of `count` ports. */
export function portLengthFor(vbLitres: number, fb: number, areaMm2: number, count: number): number {
  const a = areaMm2 / 1e6;
  const vb = vbLitres / 1000;
  const leff = (a * SPEED_OF_SOUND ** 2) / (4 * Math.PI ** 2 * fb ** 2 * vb);
  return leff * 1000 - endCorrection(areaMm2, count);
}

/** Tuning frequency (Hz) of an existing port. */
export function tuningFor(vbLitres: number, areaMm2: number, count: number, lengthMm: number): number {
  const leff = (lengthMm + endCorrection(areaMm2, count)) / 1000;
  const a = areaMm2 / 1e6;
  const vb = vbLitres / 1000;
  if (vb <= 0 || leff <= 0) return 0;
  return (SPEED_OF_SOUND / (2 * Math.PI)) * Math.sqrt(a / (vb * leff));
}
