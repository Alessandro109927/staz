import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { OddsRangeKpi } from '../../../core/models';
import { VsChartComponent } from '../vs-chart/vs-chart.component';
import {
  buildFasciaDonutChart,
  buildFasciaDonutLegend,
  FasciaDonutLegendItem,
} from './odds-range-kpi-donut.util';

@Component({
  selector: 'app-odds-range-kpi-donut',
  standalone: true,
  imports: [CommonModule, VsChartComponent],
  templateUrl: './odds-range-kpi-donut.component.html',
  styleUrl: './odds-range-kpi-donut.component.scss',
})
export class OddsRangeKpiDonutComponent implements OnChanges {
  @Input({ required: true }) kpi!: OddsRangeKpi;
  /** Etichetta segmento (es. «BASSO RISCHIO») nel report mensile. */
  @Input() segmentTag = '';

  chart?: ChartConfiguration<'doughnut'>;
  legend: FasciaDonutLegendItem[] = [];

  ngOnChanges(): void {
    this.chart = buildFasciaDonutChart(this.kpi);
    this.legend = buildFasciaDonutLegend(this.kpi);
  }

  isProfitPositive(item: FasciaDonutLegendItem): boolean {
    return item.label === 'Profitto netto' && +this.kpi.netProfit >= 0;
  }

  isProfitNegative(item: FasciaDonutLegendItem): boolean {
    return item.label === 'Profitto netto' && +this.kpi.netProfit < 0;
  }

  isMarginPositive(item: FasciaDonutLegendItem): boolean {
    return item.label === 'Margine' && this.kpi.profitMargin != null && +this.kpi.profitMargin >= 0;
  }

  isMarginNegative(item: FasciaDonutLegendItem): boolean {
    return item.label === 'Margine' && this.kpi.profitMargin != null && +this.kpi.profitMargin < 0;
  }
}
