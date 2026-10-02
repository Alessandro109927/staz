import { ChartConfiguration } from 'chart.js';
import { VS_LOSS, VS_PROFIT } from '../../../core/constants/app-colors';
import { OddsRangeKpi } from '../../../core/models';
import {
  buildOutcomeDonutChart,
  buildOutcomeDonutLegend,
  OutcomeDonutLegendItem,
} from '../../utils/outcome-donut.util';

const SERIES_NEUTRAL = [
  'rgba(0, 0, 0, 0.72)',
  'rgba(0, 0, 0, 0.52)',
  'rgba(0, 0, 0, 0.36)',
  'rgba(0, 0, 0, 0.22)',
] as const;

export interface FasciaDonutLegendItem extends OutcomeDonutLegendItem {
  metric?: boolean;
}

export function buildFasciaDonutLegend(kpi: OddsRangeKpi): FasciaDonutLegendItem[] {
  const items: FasciaDonutLegendItem[] = buildOutcomeDonutLegend({
    won: kpi.won,
    lost: kpi.lost,
    pending: kpi.pending,
    total: kpi.total,
  });

  items.push({
    label: 'Win rate',
    detail: '',
    percent: kpi.winRate != null ? `${kpi.winRate}%` : '—',
    color: SERIES_NEUTRAL[0],
    metric: true,
  });

  const profit = +kpi.netProfit;
  items.push({
    label: 'Profitto netto',
    detail: '',
    percent:
      kpi.settled > 0 ? `${profit >= 0 ? '+' : ''}€ ${kpi.netProfit}` : '—',
    color:
      kpi.settled > 0 && profit < 0
        ? VS_LOSS
        : profit >= 0 && kpi.settled > 0
          ? VS_PROFIT
          : SERIES_NEUTRAL[0],
    metric: true,
  });
  items.push({
    label: 'Margine',
    detail: '',
    percent:
      kpi.settled > 0 && kpi.profitMargin != null
        ? `${+kpi.profitMargin >= 0 ? '+' : ''}${kpi.profitMargin}%`
        : '—',
    color:
      kpi.settled > 0 && kpi.profitMargin != null && +kpi.profitMargin < 0
        ? VS_LOSS
        : kpi.settled > 0 && kpi.profitMargin != null && +kpi.profitMargin >= 0
          ? VS_PROFIT
          : SERIES_NEUTRAL[2],
    metric: true,
  });

  return items;
}

export function buildFasciaDonutChart(kpi: OddsRangeKpi): ChartConfiguration<'doughnut'> {
  return buildOutcomeDonutChart({
    won: kpi.won,
    lost: kpi.lost,
    pending: kpi.pending,
    total: kpi.total,
  });
}
