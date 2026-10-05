import { moneyDifference } from '../utils/money.util';

export type BetStatus = 'PENDING' | 'WON' | 'LOST';

export interface User {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface Capital {
  id: number;
  initialCapital: string;
  startingCapital: string;
  currentCapital: string;
  profit?: string;
  createdAt: string;
}

export function startingCapitalValue(capital: Capital): number {
  return moneyDifference(capital.startingCapital ?? capital.initialCapital, 0);
}

export function profitFromCapital(capital: Capital): number {
  if (capital.profit != null) {
    return moneyDifference(capital.profit, 0);
  }

  return moneyDifference(
    capital.currentCapital,
    capital.startingCapital ?? capital.initialCapital,
  );
}

export interface StakingRule {
  id: number;
  minOdds: string;
  maxOdds: string | null;
  stakePercentage: string;
}

export interface TeamOption {
  id: number;
  name: string;
  logoUrl: string;
  countryCode: string | null;
}

export type OutcomeOptionKind = 'standard' | 'scorer';

export interface OutcomeOption {
  id: number;
  label: string;
  description: string | null;
  sortOrder: number;
  kind: OutcomeOptionKind;
}

export type EventResultStatus = 'WON' | 'LOST' | null;

export interface BetEventItem {
  eventName: string;
  outcome: string;
  odds: number;
  resultStatus?: EventResultStatus;
}

export interface BetEvent {
  id: number;
  eventName: string;
  outcome: string | null;
  odds: string;
  sortOrder: number;
  resultStatus: EventResultStatus;
}

export interface StakePreview {
  stakePercentage: string;
  amountStaked: string;
  initialCapital: string;
  combinedOdds: string;
  events: Array<{ eventName: string; outcome: string; odds: string }>;
}

export interface Bet {
  id: number;
  eventName: string;
  events: BetEvent[];
  odds: string;
  stakePercentageApplied: string;
  amountStaked: string;
  potentialWin: string;
  capitalBefore: string;
  capitalAfter: string | null;
  capitalDelta: string | null;
  status: BetStatus;
  betDate: string;
  settledAt: string | null;
}

export interface BetStats {
  won: number;
  lost: number;
  pending: number;
  total: number;
}

export interface OddsRangeKpi {
  key: string;
  label: string;
  minOdds: number;
  maxOdds: number | null;
  total: number;
  won: number;
  lost: number;
  pending: number;
  settled: number;
  winRate: string | null;
  totalStaked: string;
  netProfit: string;
  profitMargin: string | null;
}

export interface MonthOption {
  year: number;
  month: number;
}

export interface MonthlyReport {
  year: number;
  month: number;
  profit: string;
  totalStaked: string;
  averageOdds: string | null;
  won: number;
  lost: number;
  pending: number;
  total: number;
  winRate: string | null;
  roi: string | null;
  oddsRanges: OddsRangeKpi[];
}

export function combineOdds(events: BetEventItem[]): number | null {
  if (!events.length || events.some((event) => !event.odds || event.odds <= 1)) {
    return null;
  }

  return Number(
    events.reduce((acc, event) => acc * event.odds, 1).toFixed(2),
  );
}

export function betPotentialWin(bet: Bet): number {
  if (bet.potentialWin != null && bet.potentialWin !== '') {
    return Number(bet.potentialWin);
  }

  return Number(bet.amountStaked) * Number(bet.odds);
}

export type ScalataRunStatus = 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'ABANDONED';
export type ScalataStepStatus = 'PENDING' | 'WON' | 'LOST';

export interface ScalataStepBet {
  id: number;
  eventName: string;
  odds: string;
  amountStaked: string;
  potentialWin: string | null;
  status: BetStatus;
  betDate: string;
  events: BetEvent[];
}

export interface ScalataRunStep {
  id: number;
  day: number;
  bankrollBefore: string;
  stake: string;
  plannedOdds: string;
  bankrollAfter: string;
  stepProfit: string;
  cumulativeProfit: string;
  riskLevel: 'low' | 'medium' | 'high';
  status: ScalataStepStatus;
  betId: number | null;
  isCurrent: boolean;
  isLocked: boolean;
  bet: ScalataStepBet | null;
}

export interface ScalataRun {
  id: number;
  status: ScalataRunStatus;
  startBankroll: string;
  targetProfit: string;
  targetCapital: string;
  daysMode: string;
  oddsStrategy: string;
  maxDailyOdds: string;
  minDailyOdds: string;
  totalDays: number;
  currentDay: number;
  completedSteps: number;
  progressPercent: number;
  createdAt: string;
  completedAt: string | null;
  capitalSettled: boolean;
  capitalAdjustment: string | null;
  steps: ScalataRunStep[];
}

export interface CreateScalataPayload {
  startBankroll: number;
  targetProfit: number;
  daysMode: 'auto' | 'manual';
  days: number;
  maxDailyOdds: number;
  minDailyOdds: number;
  oddsStrategy: 'uniform' | 'decreasing';
}

export interface MultigolScoutCompetition {
  key: string;
  id: number;
  code: string | null;
  name: string;
  areaName: string | null;
  areaCode: string | null;
}

export interface MultigolOpportunity {
  matchId: number;
  leagueCode: string;
  leagueName: string;
  areaName: string | null;
  areaCode: string | null;
  utcDate: string;
  eventName: string;
  homeTeam: { id: number; name: string; crest: string | null };
  awayTeam: { id: number; name: string; crest: string | null };
  outcomeLabel: string;
  probabilityPercent: number;
  teaser: string;
}

export interface MultigolOpportunitiesResponse {
  from: string;
  to: string;
  leagues: string[];
  items: MultigolOpportunity[];
}

export interface MultigolStandingSnapshot {
  position: number | null;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  playedGames: number;
}

export interface MultigolVenueStatSlice {
  standingDetail: MultigolStandingSnapshot | null;
  lambda: number;
  pMultigol1to6: number;
  bandRate: number | null;
  bandHits?: number;
  bandMatches?: number;
}

export interface MultigolTeamVenueStats {
  all: MultigolVenueStatSlice;
  home: MultigolVenueStatSlice;
  away: MultigolVenueStatSlice;
}

export interface MultigolH2hMatchEntry {
  matchId: number;
  utcDate: string;
  homeTeamName: string;
  homeTeamCrest: string;
  awayTeamName: string;
  awayTeamCrest: string;
  scoreHome: number;
  scoreAway: number;
  fixtureHomeAtHome: boolean;
}

export interface MultigolFormGoalEntry {
  matchId: number;
  opponentId?: number;
  opponentName: string;
  opponentCrest?: string | null;
  goalsScored: number;
  goalsConceded: number;
  venue: 'home' | 'away';
  utcDate: string;
}

export interface MultigolAnalysis {
  matchId: number;
  leagueCode: string;
  leagueName: string;
  areaName: string | null;
  areaCode: string | null;
  utcDate: string;
  eventName: string;
  homeTeam: { id: number; name: string; crest: string | null };
  awayTeam: { id: number; name: string; crest: string | null };
  pick: {
    outcomeLabel: string;
    probability: number;
    lambdaSide: number;
  } | null;
  pHome1to6: number;
  pAway1to6: number;
  lambdaHome: number;
  lambdaAway: number;
  stats: {
    homeStanding: string;
    awayStanding: string;
    homeStandingDetail: MultigolStandingSnapshot | null;
    awayStandingDetail: MultigolStandingSnapshot | null;
    homeFormGoals: string;
    awayFormGoals: string;
    homeFormGoalsDetail?: MultigolFormGoalEntry[];
    awayFormGoalsDetail?: MultigolFormGoalEntry[];
    h2hSummary: string;
    h2hMatchesDetail?: MultigolH2hMatchEntry[];
    h2hMultigolHomePct?: number | null;
    h2hMultigolAwayPct?: number | null;
    homeBandRate: number | null;
    awayBandRate: number | null;
    homeVenueStats?: MultigolTeamVenueStats;
    awayVenueStats?: MultigolTeamVenueStats;
  };
  analysis: string;
  explanation: string;
  aiExplanation: string | null;
  aiEnabled: boolean;
}
