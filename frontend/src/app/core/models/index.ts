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
  createdAt: string;
}

export function startingCapitalValue(capital: Capital): number {
  return Number(capital.startingCapital ?? capital.initialCapital);
}

export function profitFromCapital(capital: Capital): number {
  return Number(capital.currentCapital) - startingCapitalValue(capital);
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
