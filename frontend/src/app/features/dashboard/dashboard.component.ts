import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import {
  Bet,
  BetStats,
  BetStatus,
  Capital,
  OddsRangeKpi,
  profitFromCapital,
  startingCapitalValue,
} from '../../core/models';
import {
  buildCapitalEvolutionChart,
  capitalSeriesPeaks,
  type CapitalChartPeriodDays,
} from './dashboard-charts.util';

/** Target ROI stagionale mostrato in dashboard (percentuale). */
const DASHBOARD_SEASON_ROI_TARGET = 120;
import { VsChartComponent } from '../../shared/components/vs-chart/vs-chart.component';
import { OddsRangeKpiDonutComponent } from '../../shared/components/odds-range-kpi-donut/odds-range-kpi-donut.component';
import { DashboardCapitalFlowComponent } from './dashboard-capital-flow.component';

export interface DashboardPeriodOption {
  days: CapitalChartPeriodDays;
  label: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    VsChartComponent,
    OddsRangeKpiDonutComponent,
    DashboardCapitalFlowComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly betChange = inject(BetChangeService);

  readonly periodOptions: DashboardPeriodOption[] = [
    { days: 7, label: '7gg' },
    { days: 30, label: '30gg' },
    { days: 90, label: '90gg' },
    { days: null, label: 'Tutto' },
  ];

  selectedPeriod: CapitalChartPeriodDays = null;

  capital: Capital | null = null;
  stats: BetStats | null = null;
  oddsRangeKpis: OddsRangeKpi[] = [];
  allBets: Bet[] = [];

  capitalChart?: ChartConfiguration;
  peakMax = 0;
  peakMin = 0;

  readonly seasonRoiTarget = DASHBOARD_SEASON_ROI_TARGET;

  ngOnInit(): void {
    this.loadData();
    this.betChange.changed.subscribe(() => this.loadData());
  }

  selectPeriod(days: CapitalChartPeriodDays): void {
    this.selectedPeriod = days;
    if (this.capital) {
      this.buildOverviewChart(this.capital, this.allBets);
    }
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
        this.buildOverviewChart(capital, allBets);
      }
    });
  }

  private buildOverviewChart(capital: Capital, bets: Bet[]): void {
    this.capitalChart = buildCapitalEvolutionChart(
      capital,
      bets,
      this.selectedPeriod,
    );
    const dataset = this.capitalChart.data.datasets[0]?.data as number[] | undefined;
    const peaks = capitalSeriesPeaks(dataset ?? []);
    this.peakMax = peaks.peakMax;
    this.peakMin = peaks.peakMin;
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

  get startingCapital(): number {
    if (!this.capital) {
      return 0;
    }
    return startingCapitalValue(this.capital);
  }

  get currentCapital(): number {
    if (!this.capital) {
      return 0;
    }
    return Number(this.capital.currentCapital);
  }

  get capitalMultiplier(): number {
    if (this.startingCapital <= 0) {
      return 1;
    }
    return this.currentCapital / this.startingCapital;
  }

  /** Quota del capitale attuale corrispondente al capitale iniziale (barra rapporto). */
  get capitalPrincipalBarPercent(): number {
    if (this.currentCapital <= 0) {
      return 100;
    }
    return Math.max(0, Math.min(100, (this.startingCapital / this.currentCapital) * 100));
  }

  get capitalGrowthBarPercent(): number {
    return Math.max(0, Math.min(100, 100 - this.capitalPrincipalBarPercent));
  }

  get activeBettingDays(): number {
    const days = new Set<string>();
    for (const bet of this.allBets) {
      if (bet.settledAt) {
        days.add(new Date(bet.settledAt).toISOString().slice(0, 10));
      }
    }
    return days.size;
  }

  get avgProfitPerActiveDay(): number {
    const days = this.activeBettingDays;
    if (days <= 0) {
      return 0;
    }
    return this.profit / days;
  }

  get roiTargetProgressPercent(): number {
    if (this.seasonRoiTarget <= 0 || this.roi <= 0) {
      return 0;
    }
    return Math.min(100, (this.roi / this.seasonRoiTarget) * 100);
  }

  get settledBetsCount(): number {
    if (!this.stats) {
      return 0;
    }
    return this.stats.won + this.stats.lost;
  }

  get winRatePercent(): number {
    if (this.settledBetsCount <= 0 || !this.stats) {
      return 0;
    }
    return (this.stats.won / this.settledBetsCount) * 100;
  }

  get winRateLostPercent(): number {
    return Math.max(0, 100 - this.winRatePercent);
  }

  /** Dieci scommesse regolate con profitto netto più alto. */
  get topProfitBets(): Bet[] {
    return [...this.allBets]
      .filter((bet) => {
        const delta = this.betProfitAmount(bet);
        return delta != null && delta > 0;
      })
      .sort((a, b) => Number(b.capitalDelta!) - Number(a.capitalDelta!))
      .slice(0, 10);
  }

  betStatusLabel(status: BetStatus): string {
    switch (status) {
      case 'WON':
        return 'VINTO';
      case 'LOST':
        return 'PERSO';
      case 'PENDING':
        return 'APERTA';
    }
  }

  betProfitAmount(bet: Bet): number | null {
    if (bet.capitalDelta == null) {
      return null;
    }
    return Number(bet.capitalDelta);
  }

  hasSettledBets(kpi: OddsRangeKpi): boolean {
    return kpi.settled > 0;
  }
}
