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

export function calibrationDeltaPercent(
  observed: number | null,
  expected: number | null,
): number | null {
  if (observed == null || expected == null || !Number.isFinite(observed) || !Number.isFinite(expected)) {
    return null;
  }
  return observed - expected;
}

export function formatCalibrationDelta(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1).replace('.', ',')}%`;
}

export function calibrationMetricTitle(label: string): string {
  switch (label) {
    case 'Sintesi':
      return 'Modello sintesi';
    case 'Poisson':
      return 'Distribuzione Poisson';
    case 'Empirica':
      return 'Frequenza empirica';
    default:
      return label;
  }
}

export function calibrationFeaturedBandTitle(bandLabel: string): string {
  return `(${bandLabel})`;
}

export function calibrationMetricIcon(label: string): string {
  switch (label) {
    case 'Sintesi':
      return 'task_alt';
    case 'Poisson':
      return 'functions';
    case 'Empirica':
      return 'schedule';
    default:
      return 'insights';
  }
}

export type CalibrationObservedTone = 'strong' | 'neutral' | 'low';

export function calibrationObservedTone(
  observedPercent: number | null,
): CalibrationObservedTone {
  if (observedPercent == null || !Number.isFinite(observedPercent)) {
    return 'neutral';
  }
  if (observedPercent < 50) {
    return 'low';
  }
  if (observedPercent >= 75) {
    return 'strong';
  }
  return 'neutral';
}

export function calibrationBandConcludedCount(
  section: MultigolCalibrationBandSectionView,
): number {
  const synthesis = section.metrics.find((m) => m.label === METRIC_LABELS.synthesis);
  return synthesis?.total ?? section.metrics[0]?.total ?? 0;
}

export function calibrationSynthesisRow(
  section: MultigolCalibrationBandSectionView,
): MultigolCalibrationRowView | null {
  return (
    section.metrics.find((m) => m.label === METRIC_LABELS.synthesis) ?? section.metrics[0] ?? null
  );
}

export function calibrationBandHeadline(section: MultigolCalibrationBandSectionView): string {
  if (section.id === '90-100') {
    return calibrationFeaturedBandTitle(section.bandLabel);
  }
  return section.bandLabel;
}
