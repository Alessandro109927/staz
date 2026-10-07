/** Fasce allineate ai filtri sintesi min. in UI (+ estremi). */
export const MULTIGOL_SCOUT_CALIBRATION_BAND_DEFS = [
  { id: '0-50', label: 'Sotto 50%', min: 0, max: 50, maxExclusive: true },
  { id: '50-58', label: '50% – 57,9%', min: 50, max: 58, maxExclusive: true },
  { id: '58-68', label: '58% – 67,9%', min: 58, max: 68, maxExclusive: true },
  { id: '68-78', label: '68% – 77,9%', min: 68, max: 78, maxExclusive: true },
  { id: '78-90', label: '78% – 90%', min: 78, max: 90.1, maxExclusive: true },
  { id: '90-100', label: '90,1% – 100%', min: 90.1, max: 100, maxExclusive: false },
] as const;

export type MultigolScoutCalibrationBandId =
  (typeof MULTIGOL_SCOUT_CALIBRATION_BAND_DEFS)[number]['id'];

export function bandIdForPercent(percent: number): MultigolScoutCalibrationBandId | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return null;
  }
  for (const def of MULTIGOL_SCOUT_CALIBRATION_BAND_DEFS) {
    const aboveMin = percent >= def.min;
    const belowMax = def.maxExclusive ? percent < def.max : percent <= def.max;
    if (aboveMin && belowMax) {
      return def.id;
    }
  }
  return null;
}
