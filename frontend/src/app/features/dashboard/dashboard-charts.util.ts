import { ChartConfiguration } from 'chart.js';
import { Bet, Capital, OddsRangeKpi, profitFromCapital, startingCapitalValue } from '../../core/models';
import { moneyDifference } from '../../core/utils/money.util';

const PRIMARY = '#1978e5';
const PRIMARY_SOFT = 'rgba(25, 120, 229, 0.22)';
const SUCCESS = '#16a34a';
const SUCCESS_SOFT = 'rgba(22, 163, 74, 0.85)';
const DANGER = '#dc2626';
const DANGER_SOFT = 'rgba(220, 38, 38, 0.85)';
const SECONDARY = '#6b8cae';
const NEUTRAL = '#64748b';
const NEUTRAL_LIGHT = '#94a3b8';
const GRID = '#eef2f7';
const FONT = "'Inter', Roboto, sans-serif";

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
      backgroundColor: '#0f172a',
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
      color: NEUTRAL_LIGHT,
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
      color: NEUTRAL_LIGHT,
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
  if (Math.abs(num) >= 1000) {
    return `€${(num / 1000).toFixed(1)}k`;
  }
  return `€${num.toFixed(0)}`;
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
    pointBackgroundColor: '#fff',
    pointBorderColor: color,
    pointBorderWidth: 2,
  };
}

export function buildCapitalEvolutionChart(
  capital: Capital,
  bets: Bet[],
): ChartConfiguration {
  const starting = startingCapitalValue(capital);
  const labels = [formatShortDate(capital.createdAt)];
  const data = [starting];

  for (const bet of sortedSettledBets(bets)) {
    labels.push(formatShortDate(bet.settledAt!));
    data.push(Number(bet.capitalAfter));
  }

  const current = Number(capital.currentCapital);
  if (data.at(-1) !== current) {
    labels.push('Oggi');
    data.push(current);
  }

  if (data.length === 1) {
    labels.push('Oggi');
    data.push(current);
  }

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Capitale',
          ...lineDataset(
            data,
            PRIMARY,
            'gradient:rgba(25, 120, 229, 0.2):rgba(25, 120, 229, 0.02)',
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
            label: (ctx) => ` € ${Number(ctx.parsed.y).toFixed(2)}`,
          },
        },
      },
      scales: {
        x: axisXMinimal(5),
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
          backgroundColor: [SECONDARY, current >= starting ? SUCCESS : DANGER],
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

  const color = profit >= 0 ? SUCCESS : DANGER;

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Profitto',
          ...lineDataset(
            data,
            color,
            `gradient:${profit >= 0 ? 'rgba(22, 163, 74, 0.18)' : 'rgba(220, 38, 38, 0.18)'}:rgba(255,255,255,0)`,
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

export function buildMonthlyRoiChart(
  capital: Capital,
  bets: Bet[],
): ChartConfiguration {
  const starting = startingCapitalValue(capital);
  const buckets = createAllMonthBuckets(
    getTimelineStart(capital, bets),
    new Date(),
  );
  const monthlyProfit = buckets.map(() => 0);

  for (const bet of sortedSettledBets(bets)) {
    const index = buckets.findIndex(
      (bucket) => bucket.key === monthKey(new Date(bet.settledAt!)),
    );
    if (index >= 0) {
      monthlyProfit[index] += moneyDifference(
        bet.capitalAfter!,
        bet.capitalBefore,
      );
    }
  }

  const roiData = monthlyProfit.map((profit) =>
    starting > 0 ? (profit / starting) * 100 : 0,
  );

  return {
    type: 'bar',
    data: {
      labels: buckets.map((bucket) => bucket.label),
      datasets: [
        {
          data: roiData,
          backgroundColor: roiData.map((value) =>
            value >= 0 ? SUCCESS_SOFT : DANGER_SOFT,
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
            label: (ctx) => {
              const value = Number(ctx.parsed.y);
              return ` ${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
            },
          },
        },
      },
      scales: {
        x: axisXMinimal(4),
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
      data: { labels: ['—'], datasets: [{ data: [0], borderColor: NEUTRAL_LIGHT }] },
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
            PRIMARY,
            'gradient:rgba(25, 120, 229, 0.15):rgba(25, 120, 229, 0)',
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
            bucket.key === currentKey ? PRIMARY : PRIMARY_SOFT,
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

const ODDS_RANGE_COLORS: Record<string, string> = {
  '1-2': PRIMARY,
  '2-3': SUCCESS,
  '3-4': '#c45c26',
  '4-5': SECONDARY,
  '5+': '#9333ea',
};

function oddsRangeColor(kpi: OddsRangeKpi): string {
  return ODDS_RANGE_COLORS[kpi.key] ?? PRIMARY;
}

interface OddsRangeSegment {
  kpi: OddsRangeKpi;
  index: number;
  value: number;
}

export interface OddsRangeChartItem {
  key: string;
  label: string;
  color: string;
  value: string;
  percent: number;
  valueTone?: 'primary' | 'success' | 'danger';
}

function oddsRangePercent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

function buildOddsRangeSegments(
  kpis: OddsRangeKpi[],
  getValue: (kpi: OddsRangeKpi) => number,
  filter?: (kpi: OddsRangeKpi, value: number) => boolean,
): OddsRangeSegment[] {
  return kpis
    .map((kpi, index) => ({
      kpi,
      index,
      value: getValue(kpi),
    }))
    .filter(
      (segment) =>
        segment.value > 0 &&
        (filter ? filter(segment.kpi, segment.value) : true),
    );
}

export function buildOddsRangeVolumeItems(
  kpis: OddsRangeKpi[],
): OddsRangeChartItem[] {
  const segments = buildOddsRangeSegments(kpis, (kpi) => kpi.total);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return segments.map((segment) => ({
    key: segment.kpi.key,
    label: segment.kpi.label,
    color: oddsRangeColor(segment.kpi),
    value: `${segment.value} scommesse`,
    percent: oddsRangePercent(segment.value, total),
    valueTone: 'primary',
  }));
}

export function buildOddsRangeProfitItems(
  kpis: OddsRangeKpi[],
): OddsRangeChartItem[] {
  const segments = buildOddsRangeSegments(
    kpis,
    (kpi) => Math.abs(Number(kpi.netProfit)),
    (kpi) => kpi.settled > 0 && Number(kpi.netProfit) !== 0,
  );
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return segments.map((segment) => {
    const profit = Number(segment.kpi.netProfit);
    const sign = profit >= 0 ? '+' : '-';

    return {
      key: segment.kpi.key,
      label: segment.kpi.label,
      color: oddsRangeColor(segment.kpi),
      value: `${sign}€ ${Math.abs(profit).toFixed(2)}`,
      percent: oddsRangePercent(segment.value, total),
      valueTone: profit >= 0 ? 'success' : 'danger',
    };
  });
}

function buildOddsRangePieChart(
  segments: OddsRangeSegment[],
  options?: {
    getColor?: (kpi: OddsRangeKpi, index: number) => string;
    tooltipLabel?: (kpi: OddsRangeKpi, value: number, percent: number) => string;
  },
): ChartConfiguration<'pie'> | undefined {
  if (!segments.length) {
    return undefined;
  }

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return {
    type: 'pie',
    data: {
      labels: segments.map((segment) => segment.kpi.label),
      datasets: [
        {
          data: segments.map((segment) => segment.value),
          backgroundColor: segments.map((segment) =>
            options?.getColor?.(segment.kpi, segment.index) ??
            oddsRangeColor(segment.kpi),
          ),
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeOutQuart' },
      plugins: {
        ...baseTooltip(),
        legend: { display: false },
        tooltip: {
          ...baseTooltip()?.tooltip,
          titleFont: { size: 13, weight: 'bold' as const, family: FONT },
          bodyFont: { size: 12, family: FONT },
          padding: 12,
          callbacks: {
            title: (items) => items[0]?.label ?? '',
            label: (ctx) => {
              const segment = segments[ctx.dataIndex];
              const percent = oddsRangePercent(segment.value, total);
              return options?.tooltipLabel
                ? ` ${options.tooltipLabel(segment.kpi, segment.value, percent)}`
                : ` ${segment.value} (${percent}%)`;
            },
          },
        },
      },
    },
  };
}

export function buildOddsRangeVolumeChart(
  kpis: OddsRangeKpi[],
): ChartConfiguration<'pie'> | undefined {
  const segments = buildOddsRangeSegments(kpis, (kpi) => kpi.total);

  return buildOddsRangePieChart(segments, {
    tooltipLabel: (_kpi, value, percent) => `${value} scommesse (${percent}%)`,
  });
}

export function buildOddsRangeProfitChart(
  kpis: OddsRangeKpi[],
): ChartConfiguration<'pie'> | undefined {
  const segments = buildOddsRangeSegments(
    kpis,
    (kpi) => Math.abs(Number(kpi.netProfit)),
    (kpi) => kpi.settled > 0 && Number(kpi.netProfit) !== 0,
  );

  return buildOddsRangePieChart(segments, {
    tooltipLabel: (kpi, _value, percent) => {
      const profit = Number(kpi.netProfit);
      const sign = profit >= 0 ? '+' : '-';
      return `${sign}€ ${Math.abs(profit).toFixed(2)} (${percent}%)`;
    },
  });
}
