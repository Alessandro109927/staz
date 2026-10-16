import type { MatchDossier } from './multigol-dossier.util';
import type { MultigolInsights } from './multigol-model.util';

export type MultigolOpportunity = {
  matchId: number;
  leagueCode: string;
  leagueName: string;
  areaName: string | null;
  areaCode: string | null;
  utcDate: string;
  matchday: number | null;
  roundLabel: string | null;
  eventName: string;
  homeTeam: { id: number; name: string; crest: string | null };
  awayTeam: { id: number; name: string; crest: string | null };
  outcomeLabel: string;
  probabilityPercent: number;
  empiricalProbabilityPercent: number | null;
  empiricalSampleHits: number;
  empiricalSampleMatches: number;
  synthesisPercent: number;
  xgLambdaSide: number | null;
  xgSampleMatches: number;
  /** Probabilità di mercato (Over 0.5 squadra, senza margine) se disponibile. */
  marketPercent?: number | null;
  /** Tasso di segnatura reale (gare senza segnare / porta inviolata avversaria). */
  scoringRatePercent?: number | null;
  /** Versione del modello che ha prodotto questi numeri. */
  modelVersion?: number;
  teaser: string;
};

export type MultigolAnalysis = MatchDossier & {
  areaName: string | null;
  areaCode: string | null;
  /** Dati extra del modello (scomposizione, quote, infortuni, riposo). */
  insights: MultigolInsights | null;
  analysis: string;
  explanation: string;
  aiExplanation: string | null;
  aiEnabled: boolean;
};
