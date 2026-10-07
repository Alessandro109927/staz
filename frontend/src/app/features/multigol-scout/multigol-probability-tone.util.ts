/**
 * Soglie allineate allo scout (minimo in lista ~50% modello).
 * ≥78%: alta confidenza · ≥68%: probabile · ≥58%: discreta · ≥50%: borderline · <50%: debole
 */
export type MultigolProbTone = 'strong' | 'good' | 'mid' | 'low' | 'weak';

export function multigolProbabilityTone(
  percent: number | null | undefined,
): MultigolProbTone {
  if (percent == null || !Number.isFinite(percent)) {
    return 'weak';
  }
  if (percent >= 78) {
    return 'strong';
  }
  if (percent >= 68) {
    return 'good';
  }
  if (percent >= 58) {
    return 'mid';
  }
  if (percent >= 50) {
    return 'low';
  }
  return 'weak';
}

export function multigolProbabilityToneClass(
  percent: number | null | undefined,
): string {
  return `multigol-prob-tone--${multigolProbabilityTone(percent)}`;
}

export function multigolProbabilityBlockToneClass(
  percent: number | null | undefined,
): string {
  return `multigol-prob-block-tone--${multigolProbabilityTone(percent)}`;
}

export function multigolProbabilityToneHint(
  percent: number | null | undefined,
): string {
  const tone = multigolProbabilityTone(percent);
  switch (tone) {
    case 'strong':
      return 'Alta probabilità (≥78%)';
    case 'good':
      return 'Probabile (68–77%)';
    case 'mid':
      return 'Discreta (58–67%)';
    case 'low':
      return 'Borderline (50–57%)';
    default:
      return 'Bassa confidenza (<50%)';
  }
}
