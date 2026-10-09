import { ChartConfiguration } from 'chart.js';
import {
  VS_CHART_AXIS,
  VS_CHART_GRID,
  VS_INK,
  VS_LOSS,
  VS_LOSS_CHART_FILL_SOFT,
  VS_PROFIT,
  VS_PROFIT_CHART_FILL,
  VS_PROFIT_CHART_FILL_SOFT,
} from '../../core/constants/app-colors';
import { APP_FONT_FAMILY } from '../../core/constants/app-font';
import { Bet, Capital, profitFromCapital, startingCapitalValue } from '../../core/models';
import { moneyDifference } from '../../core/utils/money.util';

const WHITE = '#ffffff';
const GRID = VS_CHART_GRID;
const AXIS = VS_CHART_AXIS;
const FILL = VS_PROFIT_CHART_FILL;
const SERIES = [
  VS_INK,
  'rgba(11, 28, 48, 0.72)',
  'rgba(11, 28, 48, 0.52)',
  'rgba(11, 28, 48, 0.36)',
  'rgba(11, 28, 48, 0.22)',
] as const;

export type CapitalChartPeriodDays = 7 | 30 | 90 | null;
const FONT = APP_FONT_FAMILY;

interface MonthBucket {
  key: string;
  label: string;
}

function formatShortDate(value: string | Date): string {
  const label = new Date(value).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
  });
  return label.replace('.', '');
}

function formatMonthLabel(value: Date): string {
  const label = value
    .toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })
    .replace('.', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function createAllMonthBuckets(from: Date, to: Date): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);

  while (cursor <= end) {
    buckets.push({
      key: monthKey(cursor),
      label: formatMonthLabel(cursor),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return buckets.length
    ? buckets
    : [{ key: monthKey(to), label: formatMonthLabel(to) }];
}

function getTimelineStart(capital: Capital, bets: Bet[]): Date {
  const dates = [
    new Date(capital.createdAt),
    ...bets.map((bet) => new Date(bet.betDate)),
    ...sortedSettledBets(bets).map((bet) => new Date(bet.settledAt!)),
  ];
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}

function sortedSettledBets(bets: Bet[]): Bet[] {
  return bets
    .filter((bet) => bet.settledAt && bet.capitalAfter)
    .sort(
      (a, b) =>
        new Date(a.settledAt!).getTime() - new Date(b.settledAt!).getTime(),
    );
}

function baseTooltip(): NonNullable<ChartConfiguration['options']>['plugins'] {
  return {
    legend: { display: false },
    tooltip: {
      backgroundColor: VS_INK,
      padding: 10,
      cornerRadius: 8,
      titleFont: { size: 11, weight: 'bold' as const, family: FONT },
      bodyFont: { size: 11, family: FONT },
    },
  };
}

function axisXMinimal(maxTicks = 4) {
  return {
    display: true,
    grid: { display: false },
    border: { display: false },
    ticks: {
      color: AXIS,
      font: { size: 9, family: FONT },
      maxRotation: 0,
      autoSkip: true,
      maxTicksLimit: maxTicks,
    },
  };
}

function axisYMinimal(
  formatter?: (value: string | number) => string,
  maxTicks = 3,
) {
  return {
    display: true,
    grid: { color: GRID, drawTicks: false },
    border: { display: false },
    ticks: {
      color: AXIS,
      font: { size: 9, family: FONT },
      maxTicksLimit: maxTicks,
      callback: formatter,
    },
  };
}

function axisHidden() {
  return { display: false };
}

function baseChartOptions(
  extra?: ChartConfiguration['options'],
): ChartConfiguration['options'] {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 700, easing: 'easeOutQuart' },
    interaction: { intersect: false, mode: 'index' },
    layout: { padding: { top: 2, right: 2, bottom: 0, left: 0 } },
    ...extra,
  };
}

function euro(value: string | number): string {
  const num = Number(value);
  return `€ ${num.toLocaleString('it-IT', { maximumFractionDigits: 0 })}`;
}

function periodCutoff(periodDays: CapitalChartPeriodDays): Date | null {
  if (periodDays == null) {
    return null;
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

export function capitalSeriesPeaks(values: number[]): { peakMax: number; peakMin: number } {
  if (!values.length) {
    return { peakMax: 0, peakMin: 0 };
  }
  return {
    peakMax: Math.max(...values),
    peakMin: Math.min(...values),
  };
}

function lineDataset(
  data: number[],
  color: string,
  gradient: string,
  pointCount: number,
) {
  return {
    data,
    borderColor: color,
    backgroundColor: gradient,
    fill: true,
    tension: 0.42,
    borderWidth: 2,
    pointRadius: pointCount <= 8 ? 3 : 0,
    pointHoverRadius: 5,
    pointBackgroundColor: WHITE,
    pointBorderColor: color,
    pointBorderWidth: 2,
  };
}

export function buildCapitalEvolutionChart(
  capital: Capital,
  bets: Bet[],
  periodDays: CapitalChartPeriodDays = null,
): ChartConfiguration {
  const settled = sortedSettledBets(bets);
  const cutoff = periodCutoff(periodDays);
  const labels: string[] = [];
  const data: number[] = [];
  const starting = startingCapitalValue(capital);

  if (cutoff) {
    let capitalAtStart = starting;
    for (const bet of settled) {
      if (new Date(bet.settledAt!) < cutoff) {
        capitalAtStart = Number(bet.capitalAfter);
      }
    }
    labels.push(formatShortDate(cutoff));
    data.push(capitalAtStart);

    for (const bet of settled) {
      if (new Date(bet.settledAt!) >= cutoff) {
        labels.push(formatShortDate(bet.settledAt!));
        data.push(Number(bet.capitalAfter));
      }
    }
  } else {
    labels.push(formatShortDate(capital.createdAt));
    data.push(starting);

    for (const bet of settled) {
      labels.push(formatShortDate(bet.settledAt!));
      data.push(Number(bet.capitalAfter));
    }
  }

  const current = Number(capital.currentCapital);
  if (data.at(-1) !== current) {
    labels.push(formatShortDate(new Date()));
    data.push(current);
  }

  if (data.length === 1) {
    labels.push(formatShortDate(new Date()));
    data.push(current);
  }

  const lastIdx = labels.length - 1;
  labels[lastIdx] = `${labels[lastIdx]} (Oggi)`;

  const pointRadius = data.map((_, index) => (index === data.length - 1 ? 5 : 0));

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Capitale',
          ...lineDataset(
            data,
            VS_PROFIT,
            `gradient:${VS_PROFIT_CHART_FILL}:${VS_PROFIT_CHART_FILL_SOFT}`,
            data.length,
          ),
          pointRadius,
          pointHoverRadius: data.map((_, index) => (index === data.length - 1 ? 6 : 4)),
          pointBackgroundColor: VS_PROFIT,
          pointBorderColor: WHITE,
        },
      ],
    },
    options: baseChartOptions({
      plugins: {
        ...baseTooltip(),
        tooltip: {
          ...baseTooltip()?.tooltip,
          callbacks: {
            label: (ctx) => ` € ${Number(ctx.parsed.y).toFixed(2)}`,
          },
        },
      },
      scales: {
        x: axisXMinimal(6),
        y: axisYMinimal(euro, 4),
      },
    }),
  };
}

export function buildInitialCapitalChart(capital: Capital): ChartConfiguration {
  const starting = startingCapitalValue(capital);
  const current = Number(capital.currentCapital);

  return {
    type: 'bar',
    data: {
      labels: ['Iniz.', 'Oggi'],
      datasets: [
        {
          data: [starting, current],
          backgroundColor: [SERIES[4], current >= starting ? VS_PROFIT : VS_LOSS],
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 32,
        },
      ],
    },
    options: baseChartOptions({
      plugins: baseTooltip(),
      scales: {
        x: axisXMinimal(2),
        y: axisHidden(),
      },
    }),
  };
}

export function buildProfitChart(capital: Capital, bets: Bet[]): ChartConfiguration {
  const starting = startingCapitalValue(capital);
  const labels = [formatShortDate(capital.createdAt)];
  const data = [0];

  for (const bet of sortedSettledBets(bets)) {
    labels.push(formatShortDate(bet.settledAt!));
    data.push(
      moneyDifference(
        bet.capitalAfter!,
        capital.startingCapital ?? capital.initialCapital,
      ),
    );
  }

  const profit = profitFromCapital(capital);
  if (data.at(-1) !== profit) {
    labels.push('Oggi');
    data.push(profit);
  }

  if (data.length === 1) {
    labels.push('Oggi');
    data.push(profit);
  }

  const lineColor = profit >= 0 ? VS_PROFIT : VS_LOSS;
  const fillFrom = profit >= 0 ? VS_PROFIT_CHART_FILL : VS_LOSS_CHART_FILL_SOFT;

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Profitto',
          ...lineDataset(
            data,
            lineColor,
            `gradient:${fillFrom}:rgba(255,255,255,0)`,
            data.length,
          ),
        },
      ],
    },
    options: baseChartOptions({
      plugins: {
        ...baseTooltip(),
        tooltip: {
          ...baseTooltip()?.tooltip,
          callbacks: {
            label: (ctx) => {
              const value = Number(ctx.parsed.y);
              return ` ${value >= 0 ? '+' : ''}€ ${value.toFixed(2)}`;
            },
          },
        },
      },
      scales: {
        x: axisXMinimal(3),
        y: axisHidden(),
      },
    }),
  };
}

export function buildTotalRoiChart(
  capital: Capital,
  bets: Bet[],
): ChartConfiguration {
  const starting = startingCapitalValue(capital);
  const baseline = capital.startingCapital ?? capital.initialCapital;
  const labels = [formatShortDate(capital.createdAt)];
  const data = [0];

  for (const bet of sortedSettledBets(bets)) {
    labels.push(formatShortDate(bet.settledAt!));
    const profitAtPoint = moneyDifference(bet.capitalAfter!, baseline);
    data.push(starting > 0 ? (profitAtPoint / starting) * 100 : 0);
  }

  const totalRoi = starting > 0 ? (profitFromCapital(capital) / starting) * 100 : 0;
  if (data.at(-1) !== totalRoi) {
    labels.push('Oggi');
    data.push(totalRoi);
  }

  if (data.length === 1) {
    labels.push('Oggi');
    data.push(totalRoi);
  }

  const lineColor = totalRoi >= 0 ? VS_PROFIT : VS_LOSS;
  const fillFrom = totalRoi >= 0 ? VS_PROFIT_CHART_FILL : VS_LOSS_CHART_FILL_SOFT;

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'ROI',
          ...lineDataset(
            data,
            lineColor,
            `gradient:${fillFrom}:rgba(255,255,255,0)`,
            data.length,
          ),
        },
      ],
    },
    options: baseChartOptions({
      plugins: {
        ...baseTooltip(),
        tooltip: {
          ...baseTooltip()?.tooltip,
          callbacks: {
            label: (ctx) => {
              const value = Number(ctx.parsed.y);
              return ` ${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
            },
          },
        },
      },
      scales: {
        x: axisXMinimal(3),
        y: axisHidden(),
      },
    }),
  };
}

export function buildAverageOddsChart(bets: Bet[]): ChartConfiguration {
  const ordered = [...bets].sort(
    (a, b) => new Date(a.betDate).getTime() - new Date(b.betDate).getTime(),
  );

  if (!ordered.length) {
    return {
      type: 'line',
      data: { labels: ['—'], datasets: [{ data: [0], borderColor: AXIS }] },
      options: baseChartOptions({
        plugins: baseTooltip(),
        scales: { x: axisHidden(), y: axisHidden() },
      }),
    };
  }

  return {
    type: 'line',
    data: {
      labels: ordered.map((bet) => formatShortDate(bet.betDate)),
      datasets: [
        {
          label: 'Quota',
          ...lineDataset(
            ordered.map((bet) => Number(bet.odds)),
            VS_INK,
            `gradient:${FILL}:rgba(255,255,255,0)`,
            ordered.length,
          ),
        },
      ],
    },
    options: baseChartOptions({
      plugins: {
        ...baseTooltip(),
        tooltip: {
          ...baseTooltip()?.tooltip,
          callbacks: {
            label: (ctx) => ` ${Number(ctx.parsed.y).toFixed(2)}`,
          },
        },
      },
      scales: {
        x: axisXMinimal(3),
        y: axisHidden(),
      },
    }),
  };
}

export function buildBetsTimelineChart(
  capital: Capital,
  bets: Bet[],
): ChartConfiguration {
  const buckets = createAllMonthBuckets(
    getTimelineStart(capital, bets),
    new Date(),
  );
  const now = new Date();
  const currentKey = monthKey(now);
  const totals = buckets.map(() => 0);

  for (const bet of bets) {
    const index = buckets.findIndex(
      (bucket) => bucket.key === monthKey(new Date(bet.betDate)),
    );
    if (index >= 0) {
      totals[index] += 1;
    }
  }

  const maxValue = Math.max(...totals, 1);

  return {
    type: 'bar',
    data: {
      labels: buckets.map((bucket) => bucket.label),
      datasets: [
        {
          data: totals,
          backgroundColor: buckets.map((bucket) =>
            bucket.key === currentKey ? VS_INK : FILL,
          ),
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 24,
        },
      ],
    },
    options: baseChartOptions({
      plugins: {
        ...baseTooltip(),
        tooltip: {
          ...baseTooltip()?.tooltip,
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y} scommesse`,
          },
        },
      },
      scales: {
        x: axisXMinimal(5),
        y: {
          ...axisYMinimal((value) => `${value}`, 3),
          suggestedMax: maxValue + 0.5,
          grace: '15%',
        },
      },
    }),
  };
}

