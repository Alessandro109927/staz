import { ChartConfiguration } from 'chart.js';
import { VS_LOSS, VS_PROFIT } from '../../core/constants/app-colors';
import { APP_FONT_FAMILY } from '../../core/constants/app-font';

const OUTCOME_PENDING = 'rgba(0, 0, 0, 0.22)';

const EMPTY_RING = 'rgba(0, 0, 0, 0.08)';
const FONT = APP_FONT_FAMILY;

export interface OutcomeCounts {
  won: number;
  lost: number;
  pending: number;
  total: number;
}

export interface OutcomeDonutLegendItem {
  label: string;
  detail: string;
  percent: string;
  color: string;
  /** Riga riepilogo in fondo (es. totali). */
  summary?: boolean;
}

function segmentPercent(value: number, total: number): string {
  if (total <= 0) {
    return '—';
  }
  return `${Math.round((value / total) * 100)}%`;
}

export function buildOutcomeDonutLegend(counts: OutcomeCounts): OutcomeDonutLegendItem[] {
  return [
    {
      label: 'Vinte',
      detail: `(${counts.won})`,
      percent: segmentPercent(counts.won, counts.total),
      color: VS_PROFIT,
    },
    {
      label: 'Perse',
      detail: `(${counts.lost})`,
      percent: segmentPercent(counts.lost, counts.total),
      color: VS_LOSS,
    },
    {
      label: 'In corso',
      detail: `(${counts.pending})`,
      percent: counts.pending > 0 ? segmentPercent(counts.pending, counts.total) : '—',
      color: OUTCOME_PENDING,
    },
  ];
}

export function buildOutcomeDonutChart(counts: OutcomeCounts): ChartConfiguration<'doughnut'> {
  const segments: { value: number; color: string; label: string }[] = [];

  if (counts.won > 0) {
    segments.push({ value: counts.won, color: VS_PROFIT, label: 'Vinte' });
  }
  if (counts.lost > 0) {
    segments.push({ value: counts.lost, color: VS_LOSS, label: 'Perse' });
  }
  if (counts.pending > 0) {
    segments.push({ value: counts.pending, color: OUTCOME_PENDING, label: 'In corso' });
  }

  const hasData = segments.length > 0;

  return {
    type: 'doughnut',
    data: {
      labels: hasData ? segments.map((item) => item.label) : [''],
      datasets: [
        {
          data: hasData ? segments.map((item) => item.value) : [1],
          backgroundColor: hasData ? segments.map((item) => item.color) : [EMPTY_RING],
          borderWidth: 0,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      layout: { padding: 0 },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: hasData,
          backgroundColor: '#000',
          titleFont: { family: FONT, size: 12 },
          bodyFont: { family: FONT, size: 12 },
          padding: 10,
          callbacks: {
            label: (ctx) => {
              const value = Number(ctx.raw);
              const pct = segmentPercent(value, counts.total);
              return ` ${value} · ${pct}`;
            },
          },
        },
      },
    },
  };
}
