import {
  MULTIGOL_SCOUT_CALIBRATION_BAND_DEFS,
  type MultigolScoutCalibrationBandId,
} from './multigol-scout-calibration.constants';

export type MultigolScoutPickResultValue = 'WON' | 'LOST';

export type MultigolScoutMetricKey = 'synthesis' | 'poisson' | 'empirical';

export type MultigolScoutBandStats = {
  hits: number;
  total: number;
  /** Somma delle % nel bucket (media attesa = sumPercent / total). */
  sumPercent: number;
};

export type MultigolScoutBandMetrics = Record<
  MultigolScoutMetricKey,
  MultigolScoutBandStats
>;

/** Storage JSON: una entry per fascia. */
export type MultigolScoutCalibrationStorage = Record<
  MultigolScoutCalibrationBandId,
  MultigolScoutBandMetrics
>;

export type MultigolScoutCalibrationBandSummary = {
  id: MultigolScoutCalibrationBandId;
  label: string;
  min: number;
  max: number;
  synthesis: MultigolScoutBandStats;
  poisson: MultigolScoutBandStats;
  empirical: MultigolScoutBandStats;
};

export type MultigolScoutCalibrationSummary = {
  bands: MultigolScoutCalibrationBandSummary[];
  labeledPickCount: number;
  opportunityCount: number;
  updatedAt: string | null;
};

export function emptyBandStats(): MultigolScoutBandStats {
  return { hits: 0, total: 0, sumPercent: 0 };
}

export function emptyBandMetrics(): MultigolScoutBandMetrics {
  return {
    synthesis: emptyBandStats(),
    poisson: emptyBandStats(),
    empirical: emptyBandStats(),
  };
}

export function emptyCalibrationStorage(): MultigolScoutCalibrationStorage {
  const out = {} as MultigolScoutCalibrationStorage;
  for (const def of MULTIGOL_SCOUT_CALIBRATION_BAND_DEFS) {
    out[def.id] = emptyBandMetrics();
  }
  return out;
}

/** Legacy snapshot (solo fascia alta). */
export type LegacyHighBandCalibration = MultigolScoutBandMetrics;
