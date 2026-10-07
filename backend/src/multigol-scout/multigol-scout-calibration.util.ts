import type { MultigolOpportunity } from './multigol-scout.types';
import { bandIdForPercent } from './multigol-scout-calibration.constants';

export { bandIdForPercent } from './multigol-scout-calibration.constants';
import type {
  MultigolScoutMetricKey,
  MultigolScoutPickResultValue,
} from './multigol-scout-calibration.types';

export function metricPercent(
  opp: MultigolOpportunity,
  metric: MultigolScoutMetricKey,
): number | null {
  switch (metric) {
    case 'synthesis':
      return Number.isFinite(opp.synthesisPercent) ? opp.synthesisPercent : null;
    case 'poisson':
      return Number.isFinite(opp.probabilityPercent) ? opp.probabilityPercent : null;
    case 'empirical':
      return opp.empiricalProbabilityPercent != null &&
        Number.isFinite(opp.empiricalProbabilityPercent)
        ? opp.empiricalProbabilityPercent
        : null;
    default:
      return null;
  }
}

export function bandIdForMetric(
  opp: MultigolOpportunity,
  metric: MultigolScoutMetricKey,
): ReturnType<typeof bandIdForPercent> {
  return bandIdForPercent(metricPercent(opp, metric) ?? NaN);
}

export function isHit(result: MultigolScoutPickResultValue): boolean {
  return result === 'WON';
}
