/** Campionati mostrati per primi durante la scansione (resto in ordine alfabetico). */
export const SCOUT_LEAGUE_PRIORITY_CODES = [
  'SA',
  'PL',
  'PD',
  'BL1',
  'FL1',
] as const;

export type ScoutCompetition = {
  /** Parametro route API: `code` oppure id numerico come stringa */
  key: string;
  id: number;
  code: string | null;
  name: string;
  areaName: string | null;
  areaCode: string | null;
};

export const OUTCOME_HOME_1_6 = 'Multigol Casa 1-6';
export const OUTCOME_AWAY_1_6 = 'Multigol Ospite 1-6';

/** Probabilità minima (modello) per comparire in elenco */
export const MIN_BAND_PROBABILITY = 0.5;

/** Gol attesi minimi lato squadra per considerare multigol 1-6 */
export const MIN_LAMBDA_SIDE = 0.95;
