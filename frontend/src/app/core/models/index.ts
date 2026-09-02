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
