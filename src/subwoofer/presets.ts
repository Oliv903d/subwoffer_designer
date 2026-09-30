import type { DriverSpec } from '../types/cad';

/** Typical values for common sizes. Always replace them with your subwoofer's data sheet values. */
export const DRIVER_PRESETS: DriverSpec[] = [
  { name: 'Generic 8"', fs: 38, qts: 0.5, vas: 18, xmax: 10, sd: 215, cutoutDiameter: 184, outerDiameter: 210, mountingDepth: 100, displacement: 1 },
  { name: 'Generic 10"', fs: 34, qts: 0.48, vas: 35, xmax: 12, sd: 330, cutoutDiameter: 232, outerDiameter: 262, mountingDepth: 125, displacement: 1.5 },
  { name: 'Generic 12"', fs: 30, qts: 0.45, vas: 60, xmax: 15, sd: 480, cutoutDiameter: 280, outerDiameter: 310, mountingDepth: 150, displacement: 2.5 },
  { name: 'Generic 15"', fs: 28, qts: 0.42, vas: 110, xmax: 16, sd: 850, cutoutDiameter: 352, outerDiameter: 385, mountingDepth: 175, displacement: 3.5 },
  { name: 'Generic 18"', fs: 26, qts: 0.4, vas: 190, xmax: 18, sd: 1180, cutoutDiameter: 418, outerDiameter: 460, mountingDepth: 200, displacement: 5 },
];

export const DEFAULT_DRIVER = DRIVER_PRESETS[2];
