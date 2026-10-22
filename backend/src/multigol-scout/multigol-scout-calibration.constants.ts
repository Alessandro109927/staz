/** Soglia minima mostrata in affidabilità e in lista. Sotto non si accumula. */
export const SCOUT_VISIBLE_MIN_SYNTHESIS = 87;

/** Solo le fasce che interessano in UI. */
export const MULTIGOL_SCOUT_CALIBRATION_BAND_DEFS = [
  { id: '87-90', label: '87% – 90%', min: SCOUT_VISIBLE_MIN_SYNTHESIS, max: 90.1, maxExclusive: true },
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
