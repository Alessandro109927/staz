export type ScalataOddsStrategy = 'uniform' | 'decreasing';
export type ScalataDaysMode = 'auto' | 'manual';

export const MAX_SCALATA_DAYS = 90;
const ABSOLUTE_MIN_ODDS = 1.01;

export interface ScalataInput {
  startBankroll: number;
  targetProfit: number;
  daysMode: ScalataDaysMode;
  days: number;
  maxDailyOdds: number;
  minDailyOdds: number;
  oddsStrategy: ScalataOddsStrategy;
}

export interface ScalataStep {
  day: number;
  bankrollBefore: number;
  stake: number;
  odds: number;
  bankrollAfter: number;
  stepProfit: number;
  cumulativeProfit: number;
  remainingProfit: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ScalataPlan {
  feasible: boolean;
  message?: string;
  steps: ScalataStep[];
  totalDays: number;
  startBankroll: number;
  targetProfit: number;
  targetCapital: number;
  requiredMultiplier: number;
  averageOdds: number;
  estimatedSuccessRate: number | null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundOdds(value: number): number {
  return Math.round(value * 100) / 100;
}

function riskLevelFromOdds(odds: number): ScalataStep['riskLevel'] {
  if (odds <= 1.2) {
    return 'low';
  }
  if (odds <= 1.55) {
    return 'medium';
  }
  return 'high';
}

/** Più giorni = quote giornaliere più basse = piano più conservativo. */
function findAutoDays(multiplier: number, minPreferredOdds: number): number {
  if (multiplier <= 1) {
    return 1;
  }

  const oddsFloor = Math.max(ABSOLUTE_MIN_ODDS, minPreferredOdds);
  let bestDays = 1;

  for (let days = 1; days <= MAX_SCALATA_DAYS; days += 1) {
    const uniformOdds = Math.pow(multiplier, 1 / days);
    if (uniformOdds >= oddsFloor - 0.004) {
      bestDays = days;
    } else {
      break;
    }
  }

  return bestDays;
}

function buildDailyOdds(
  days: number,
  multiplier: number,
  maxDailyOdds: number,
  minDailyOdds: number,
  strategy: ScalataOddsStrategy,
): number[] {
  if (days === 1) {
    return [roundOdds(multiplier)];
  }

  if (strategy === 'uniform') {
    const uniform = roundOdds(Math.pow(multiplier, 1 / days));
    return Array.from({ length: days }, () => uniform);
  }

  const startOdds = Math.max(maxDailyOdds, Math.pow(multiplier, 1 / days));
  const endOdds = Math.min(minDailyOdds, Math.pow(multiplier, 1 / days));
  const logStart = Math.log(startOdds);
  const logEnd = Math.log(Math.max(endOdds, ABSOLUTE_MIN_ODDS));

  const raw = Array.from({ length: days }, (_, index) => {
    const progress = index / (days - 1);
    return Math.exp(logStart - progress * (logStart - logEnd));
  });

  const rawProduct = raw.reduce((total, odds) => total * odds, 1);
  const scale = Math.pow(multiplier / rawProduct, 1 / days);

  return raw.map((odds) => roundOdds(Math.max(ABSOLUTE_MIN_ODDS, odds * scale)));
}

function buildStepsUntilTarget(
  startBankroll: number,
  targetProfit: number,
  targetCapital: number,
  dailyOdds: number[],
): ScalataStep[] {
  const steps: ScalataStep[] = [];
  let bankroll = startBankroll;

  for (let day = 1; day <= dailyOdds.length; day += 1) {
    const stake = bankroll;
    const plannedOdds = dailyOdds[day - 1];
    const projectedAfter = roundMoney(stake * plannedOdds);
    const projectedProfit = roundMoney(projectedAfter - startBankroll);

    if (projectedProfit >= targetProfit - 0.001) {
      const bankrollAfter = targetCapital;
      const odds = roundOdds(bankrollAfter / stake);
      const stepProfit = roundMoney(bankrollAfter - stake);

      steps.push({
        day,
        bankrollBefore: roundMoney(bankroll),
        stake: roundMoney(stake),
        odds,
        bankrollAfter,
        stepProfit,
        cumulativeProfit: targetProfit,
        remainingProfit: 0,
        riskLevel: riskLevelFromOdds(odds),
      });
      break;
    }

    const stepProfit = roundMoney(projectedAfter - stake);
    const remainingProfit = roundMoney(targetProfit - projectedProfit);

    steps.push({
      day,
      bankrollBefore: roundMoney(bankroll),
      stake: roundMoney(stake),
      odds: plannedOdds,
      bankrollAfter: projectedAfter,
      stepProfit,
      cumulativeProfit: projectedProfit,
      remainingProfit: Math.max(0, remainingProfit),
      riskLevel: riskLevelFromOdds(plannedOdds),
    });

    bankroll = projectedAfter;
  }

  if (!steps.length) {
    return steps;
  }

  const last = steps.at(-1)!;
  if (last.cumulativeProfit < targetProfit - 0.001) {
    const stake = last.stake;
    const bankrollAfter = targetCapital;
    const odds = roundOdds(bankrollAfter / stake);
    last.odds = odds;
    last.bankrollAfter = bankrollAfter;
    last.stepProfit = roundMoney(bankrollAfter - stake);
    last.cumulativeProfit = targetProfit;
    last.remainingProfit = 0;
    last.riskLevel = riskLevelFromOdds(odds);
  }

  return steps;
}

export function buildScalataPlan(input: ScalataInput): ScalataPlan {
  const startBankroll = roundMoney(input.startBankroll);
  const targetProfit = roundMoney(input.targetProfit);
  const targetCapital = roundMoney(startBankroll + targetProfit);

  if (startBankroll <= 0 || targetProfit <= 0) {
    return {
      feasible: false,
      message: 'Inserisci una puntata iniziale e un obiettivo di profitto validi.',
      steps: [],
      totalDays: 0,
      startBankroll,
      targetProfit,
      targetCapital,
      requiredMultiplier: 0,
      averageOdds: 0,
      estimatedSuccessRate: null,
    };
  }

  if (input.minDailyOdds >= input.maxDailyOdds) {
    return {
      feasible: false,
      message: 'La quota minima deve essere inferiore alla quota massima.',
      steps: [],
      totalDays: 0,
      startBankroll,
      targetProfit,
      targetCapital,
      requiredMultiplier: 0,
      averageOdds: 0,
      estimatedSuccessRate: null,
    };
  }

  const requiredMultiplier = targetCapital / startBankroll;
  const scheduleDays =
    input.daysMode === 'auto'
      ? findAutoDays(requiredMultiplier, input.minDailyOdds)
      : clampDays(input.days);

  const dailyOdds = buildDailyOdds(
    scheduleDays,
    requiredMultiplier,
    input.maxDailyOdds,
    input.minDailyOdds,
    input.oddsStrategy,
  );

  const steps = buildStepsUntilTarget(
    startBankroll,
    targetProfit,
    targetCapital,
    dailyOdds,
  );
  const totalDays = steps.length;
  const usedOdds = steps.map((step) => step.odds);
  const averageOdds =
    usedOdds.reduce((total, odds) => total + odds, 0) / usedOdds.length;
  const estimatedSuccessRate = usedOdds.reduce(
    (probability, odds) => probability * (1 / odds),
    1,
  );

  return {
    feasible: true,
    steps,
    totalDays,
    startBankroll,
    targetProfit,
    targetCapital,
    requiredMultiplier: roundOdds(requiredMultiplier),
    averageOdds: roundOdds(averageOdds),
    estimatedSuccessRate: roundOdds(estimatedSuccessRate * 100),
  };
}

function clampDays(days: number): number {
  return Math.min(MAX_SCALATA_DAYS, Math.max(1, Math.floor(days)));
}

export function formatRiskLabel(level: ScalataStep['riskLevel']): string {
  switch (level) {
    case 'low':
      return 'Rischio basso';
    case 'medium':
      return 'Rischio medio';
    default:
      return 'Rischio alto';
  }
}

export function formatBetLabel(step: number): string {
  return `Bet ${step}`;
}

export function parseOddsInput(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) {
      return NaN;
    }
    return Number(normalized);
  }

  return NaN;
}
