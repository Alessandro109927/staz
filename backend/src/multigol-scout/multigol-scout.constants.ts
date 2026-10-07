/** Campionati mostrati per primi durante la scansione (resto in ordine alfabetico). */
export const SCOUT_LEAGUE_PRIORITY_CODES = [
  'SA',
  'SB',
  'PL',
  'PD',
  'BL1',
  'FL1',
  'TR1',
  'CH1',
  'DK1',
  'NO1',
] as const;

/**
 * Leghe incluse nello scout di default (top + secondi + Turchia, Nordics, Svizzera, ecc.).
 * Per l’intero catalogo API-Football: MULTIGOL_SCOUT_LEAGUE_CODES=ALL nel .env
 */
export const SCOUT_LEAGUE_CODES = [
  'SA',
  'SB',
  'PL',
  'ELC',
  'EL1',
  'EL2',
  'PD',
  'SD',
  'BL1',
  'BL2',
  'FL1',
  'FL2',
  'DED',
  'DJ1',
  'PPL',
  'PT2',
  'BE1',
  'AT1',
  'CH1',
  'DK1',
  'NO1',
  'SE1',
  'FI1',
  'TR1',
  'TR2',
  'GR1',
  'RO1',
  'HR1',
  'RS1',
  'CZ1',
  'EK',
  'SC1',
  'BSA',
  'MLS',
  'SAU',
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

/** Ultime gare finite caricate per forma gol / empirica (API-Football: max 100 per richiesta). */
export const DEFAULT_TEAM_FORM_MATCH_LIMIT = 99;

/** Scontri diretti (tutte le competizioni / storico). */
export const DEFAULT_H2H_MATCH_LIMIT = 40;
