import type {
  MultigolOpportunity,
  MultigolScoutBandStats,
  MultigolScoutCalibrationBandSummary,
  MultigolScoutCalibrationSummary,
  MultigolScoutPickResultValue,
} from '../../core/models';

type MetricKey = 'synthesis' | 'poisson' | 'empirical';

const METRICS: MetricKey[] = ['synthesis', 'poisson', 'empirical'];

function metricPercent(opp: MultigolOpportunity, metric: MetricKey): number | null {
  const value =
    metric === 'synthesis'
      ? opp.synthesisPercent
      : metric === 'poisson'
        ? opp.probabilityPercent
        : opp.empiricalProbabilityPercent;
  return value != null && Number.isFinite(value) ? value : null;
}

/** Stessa regola del backend: max esclusivo, tranne la fascia che arriva a 100. */
function bandFor(
  bands: MultigolScoutCalibrationBandSummary[],
  percent: number,
): MultigolScoutCalibrationBandSummary | null {
  if (percent < 0 || percent > 100) {
    return null;
  }
  return (
    bands.find((b) => percent >= b.min && (b.max >= 100 ? percent <= b.max : percent < b.max)) ??
    null
  );
}

function emptyStats(): MultigolScoutBandStats {
  return { hits: 0, total: 0, sumPercent: 0 };
}

/** Ricalcola la calibrazione sulle sole partite filtrate con esito registrato. */
export function calibrationForItems(
  base: MultigolScoutCalibrationSummary,
  items: readonly MultigolOpportunity[],
  pickResults: Readonly<Record<number, MultigolScoutPickResultValue | undefined>>,
): MultigolScoutCalibrationSummary {
  const bands = base.bands.map((b) => ({
    ...b,
    synthesis: emptyStats(),
    poisson: emptyStats(),
    empirical: emptyStats(),
  }));

  let labeledPickCount = 0;
  for (const item of items) {
    const result = pickResults[item.matchId];
    if (result !== 'WON' && result !== 'LOST') {
      continue;
    }
    labeledPickCount++;
    for (const metric of METRICS) {
      const percent = metricPercent(item, metric);
      if (percent == null) {
        continue;
      }
      const band = bandFor(bands, percent);
      if (!band) {
        continue;
      }
      const stats = band[metric];
      stats.total++;
      stats.sumPercent += percent;
      if (result === 'WON') {
        stats.hits++;
      }
    }
  }

  return {
    bands,
    labeledPickCount,
    opportunityCount: items.length,
    updatedAt: base.updatedAt,
  };
}
