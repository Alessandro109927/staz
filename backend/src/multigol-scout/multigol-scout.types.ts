import type { MatchDossier } from './multigol-dossier.util';

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
  teaser: string;
};

export type MultigolAnalysis = MatchDossier & {
  areaName: string | null;
  areaCode: string | null;
  analysis: string;
  explanation: string;
  aiExplanation: string | null;
  aiEnabled: boolean;
};
