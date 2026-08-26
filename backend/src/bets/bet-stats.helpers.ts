import Decimal from 'decimal.js';
import { parseMoney } from '../common/decimal.util';
import { BetStatus } from '../common/enums/bet-status.enum';
import { Bet } from './entities/bet.entity';

export interface OddsRangeBucket {
  key: string;
  label: string;
  minOdds: number;
  maxOdds: number | null;
}

export const ODDS_RANGE_BUCKETS: OddsRangeBucket[] = [
  { key: '1-2', label: '1.00 – 2.00', minOdds: 1.0, maxOdds: 2.0 },
  { key: '2-3', label: '2.01 – 3.00', minOdds: 2.01, maxOdds: 3.0 },
  { key: '3-4', label: '3.01 – 4.00', minOdds: 3.01, maxOdds: 4.0 },
  { key: '4-5', label: '4.01 – 5.00', minOdds: 4.01, maxOdds: 5.0 },
  { key: '5+', label: '> 5.00', minOdds: 5.01, maxOdds: null },
];

export interface OddsRangeAccumulator {
  key: string;
  label: string;
  minOdds: number;
  maxOdds: number | null;
  total: number;
  won: number;
  lost: number;
  pending: number;
  totalStaked: Decimal;
  netProfit: Decimal;
}

export function resolveOddsBucket(odds: number | string): OddsRangeBucket | null {
  const value = parseMoney(odds);

  for (const bucket of ODDS_RANGE_BUCKETS) {
    const aboveMin = value.gte(bucket.minOdds);
    const belowMax = bucket.maxOdds != null ? value.lte(bucket.maxOdds) : true;

    if (aboveMin && belowMax) {
      return bucket;
    }
  }

  return null;
}

export function createOddsRangeAccumulators(): OddsRangeAccumulator[] {
  return ODDS_RANGE_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    minOdds: bucket.minOdds,
    maxOdds: bucket.maxOdds,
    total: 0,
    won: 0,
    lost: 0,
    pending: 0,
    totalStaked: new Decimal(0),
    netProfit: new Decimal(0),
  }));
}

export function accumulateBetStats(
  accumulators: OddsRangeAccumulator[],
  bet: Bet,
): void {
  const bucket = resolveOddsBucket(bet.odds);
  if (!bucket) {
    return;
  }

  const accumulator = accumulators.find((item) => item.key === bucket.key);
  if (!accumulator) {
    return;
  }

  accumulator.total += 1;

  if (bet.status === BetStatus.WON) {
    accumulator.won += 1;
  } else if (bet.status === BetStatus.LOST) {
    accumulator.lost += 1;
  } else {
    accumulator.pending += 1;
    return;
  }

  const staked = parseMoney(bet.amountStaked);
  accumulator.totalStaked = accumulator.totalStaked.add(staked);

  if (bet.capitalAfter != null) {
    const delta = parseMoney(bet.capitalAfter).minus(parseMoney(bet.capitalBefore));
    accumulator.netProfit = accumulator.netProfit.add(delta);
  }
}

export function formatOddsRangeStats(accumulators: OddsRangeAccumulator[]) {
  return accumulators.map((item) => {
    const settled = item.won + item.lost;
    const winRate = settled > 0 ? (item.won / settled) * 100 : null;
    const profitMargin =
      item.totalStaked.gt(0)
        ? item.netProfit.div(item.totalStaked).mul(100)
        : null;

    return {
      key: item.key,
      label: item.label,
      minOdds: item.minOdds,
      maxOdds: item.maxOdds,
      total: item.total,
      won: item.won,
      lost: item.lost,
      pending: item.pending,
      settled,
      winRate: winRate != null ? winRate.toFixed(1) : null,
      totalStaked: item.totalStaked.toFixed(2),
      netProfit: item.netProfit.toFixed(2),
      profitMargin: profitMargin != null ? profitMargin.toFixed(1) : null,
    };
  });
}

export interface MonthlyReportSummary {
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
  oddsRanges: ReturnType<typeof formatOddsRangeStats>;
}

export function filterBetsByMonth(bets: Bet[], year: number, month: number): Bet[] {
  return bets.filter((bet) => {
    const date = new Date(bet.betDate);
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  });
}

export function listBetMonths(bets: Bet[]): Array<{ year: number; month: number }> {
  const seen = new Set<string>();

  for (const bet of bets) {
    const date = new Date(bet.betDate);
    seen.add(`${date.getFullYear()}-${date.getMonth() + 1}`);
  }

  return [...seen]
    .map((value) => {
      const [year, month] = value.split('-').map(Number);
      return { year, month };
    })
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

export function buildMonthlyReport(
  bets: Bet[],
  year: number,
  month: number,
): MonthlyReportSummary {
  const monthBets = filterBetsByMonth(bets, year, month);
  const accumulators = createOddsRangeAccumulators();

  let won = 0;
  let lost = 0;
  let pending = 0;
  let profit = new Decimal(0);
  let totalStakedSettled = new Decimal(0);
  let oddsSum = new Decimal(0);
  let oddsCount = 0;

  for (const bet of monthBets) {
    if (bet.status === BetStatus.WON) {
      won += 1;
    } else if (bet.status === BetStatus.LOST) {
      lost += 1;
    } else {
      pending += 1;
    }

    accumulateBetStats(accumulators, bet);

    oddsSum = oddsSum.add(parseMoney(bet.odds));
    oddsCount += 1;

    if (bet.status !== BetStatus.PENDING && bet.capitalAfter != null) {
      profit = profit.add(
        parseMoney(bet.capitalAfter).minus(parseMoney(bet.capitalBefore)),
      );
      totalStakedSettled = totalStakedSettled.add(parseMoney(bet.amountStaked));
    }
  }

  const settled = won + lost;
  const winRate = settled > 0 ? ((won / settled) * 100).toFixed(1) : null;
  const roi = totalStakedSettled.gt(0)
    ? profit.div(totalStakedSettled).mul(100).toFixed(1)
    : null;
  const averageOdds =
    oddsCount > 0 ? oddsSum.div(oddsCount).toFixed(2) : null;

  return {
    year,
    month,
    profit: profit.toFixed(2),
    totalStaked: totalStakedSettled.toFixed(2),
    averageOdds,
    won,
    lost,
    pending,
    total: monthBets.length,
    winRate,
    roi,
    oddsRanges: formatOddsRangeStats(accumulators),
  };
}
