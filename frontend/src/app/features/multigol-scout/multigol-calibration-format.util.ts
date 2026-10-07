import type {
  MultigolScoutBandStats,
  MultigolScoutCalibrationBandSummary,
} from '../../core/models';

export type MultigolCalibrationRowView = {
  label: string;
  hits: number;
  total: number;
  observedPercent: number | null;
  expectedPercent: number | null;
  sampleLabel: string;
};

export type MultigolCalibrationBandSectionView = {
  id: string;
  bandLabel: string;
  metrics: MultigolCalibrationRowView[];
  hasAnySample: boolean;
};

const METRIC_LABELS: Record<'synthesis' | 'poisson' | 'empirical', string> = {
  synthesis: 'Sintesi',
  poisson: 'Poisson',
  empirical: 'Empirica',
};

export function calibrationRowView(
  label: string,
  band: MultigolScoutBandStats,
): MultigolCalibrationRowView {
  const total = band.total ?? 0;
  const hits = band.hits ?? 0;
  const sumPercent = band.sumPercent ?? 0;
  return {
    label,
    hits,
    total,
    observedPercent: total > 0 ? (hits / total) * 100 : null,
    expectedPercent: total > 0 ? sumPercent / total : null,
    sampleLabel: total > 0 ? `${hits}/${total}` : '—',
  };
}

export function calibrationBandSections(
  bands: MultigolScoutCalibrationBandSummary[] | undefined,
): MultigolCalibrationBandSectionView[] {
  if (!bands?.length) {
    return [];
  }
  return [...bands].sort((a, b) => b.min - a.min).map((band) => {
    const metrics = [
      calibrationRowView(METRIC_LABELS.synthesis, band.synthesis),
      calibrationRowView(METRIC_LABELS.poisson, band.poisson),
      calibrationRowView(METRIC_LABELS.empirical, band.empirical),
    ];
    return {
      id: band.id,
      bandLabel: band.label,
      metrics,
      hasAnySample: metrics.some((m) => m.total > 0),
    };
  });
}

export function formatCalibrationPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(1).replace('.', ',')}%`;
}
