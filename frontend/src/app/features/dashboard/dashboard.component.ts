import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import { Bet, BetStats, Capital, OddsRangeKpi, profitFromCapital, startingCapitalValue } from '../../core/models';
import {
  buildCapitalEvolutionChart,
  buildInitialCapitalChart,
  buildTotalRoiChart,
  buildProfitChart,
} from './dashboard-charts.util';
import { VsChartComponent } from '../../shared/components/vs-chart/vs-chart.component';
import { OddsRangeKpiDonutComponent } from '../../shared/components/odds-range-kpi-donut/odds-range-kpi-donut.component';
import { WinRateDonutComponent } from '../../shared/components/win-rate-donut/win-rate-donut.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    VsChartComponent,
    OddsRangeKpiDonutComponent,
    WinRateDonutComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly betChange = inject(BetChangeService);

  capital: Capital | null = null;
  stats: BetStats | null = null;
  oddsRangeKpis: OddsRangeKpi[] = [];
  allBets: Bet[] = [];

  capitalChart?: ChartConfiguration;
  initialCapitalChart?: ChartConfiguration;
  profitChart?: ChartConfiguration;
  totalRoiChart?: ChartConfiguration;
  ngOnInit(): void {
    this.loadData();
    this.betChange.changed.subscribe(() => this.loadData());
  }

  private loadData(): void {
    forkJoin({
      capital: this.api.getCapital(),
      stats: this.api.getBetStats(),
      kpis: this.api.getOddsRangeStats(),
      allBets: this.api.getBets(),
    }).subscribe(({ capital, stats, kpis, allBets }) => {
      this.capital = capital;
      this.stats = stats;
      this.oddsRangeKpis = kpis;
      this.allBets = allBets;

      if (capital) {
        this.buildCharts(capital, allBets);
      }
    });
  }

  private buildCharts(capital: Capital, bets: Bet[]): void {
    this.capitalChart = buildCapitalEvolutionChart(capital, bets);
    this.initialCapitalChart = buildInitialCapitalChart(capital);
    this.profitChart = buildProfitChart(capital, bets);
    this.totalRoiChart = buildTotalRoiChart(capital, bets);
  }

  get profit(): number {
    if (!this.capital) {
      return 0;
    }
    return profitFromCapital(this.capital);
  }

  get roi(): number {
    if (!this.capital) {
      return 0;
    }
    const starting = startingCapitalValue(this.capital);
    if (starting <= 0) {
      return 0;
    }
    return (this.profit / starting) * 100;
  }

  hasSettledBets(kpi: OddsRangeKpi): boolean {
    return kpi.settled > 0;
  }
}
