import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import { Bet, BetStats, Capital, OddsRangeKpi, betPotentialWin, profitFromCapital, startingCapitalValue } from '../../core/models';
import {
  buildAverageOddsChart,
  buildBetsTimelineChart,
  buildCapitalEvolutionChart,
  buildInitialCapitalChart,
  buildMonthlyRoiChart,
  buildProfitChart,
  buildOddsRangeVolumeChart,
  buildOddsRangeProfitChart,
  buildOddsRangeVolumeItems,
  buildOddsRangeProfitItems,
  OddsRangeChartItem,
} from './dashboard-charts.util';
import { VsChartComponent } from '../../shared/components/vs-chart/vs-chart.component';
import { NewBetDialogService } from '../new-bet/new-bet-dialog.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, VsChartComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly newBetDialog = inject(NewBetDialogService);
  private readonly betChange = inject(BetChangeService);

  capital: Capital | null = null;
  stats: BetStats | null = null;
  oddsRangeKpis: OddsRangeKpi[] = [];
  pendingBets: Bet[] = [];
  allBets: Bet[] = [];

  capitalChart?: ChartConfiguration;
  initialCapitalChart?: ChartConfiguration;
  profitChart?: ChartConfiguration;
  monthlyRoiChart?: ChartConfiguration;
  averageOddsChart?: ChartConfiguration;
  betsTimelineChart?: ChartConfiguration;
  oddsRangeVolumeChart?: ChartConfiguration;
  oddsRangeProfitChart?: ChartConfiguration;
  oddsRangeVolumeItems: OddsRangeChartItem[] = [];
  oddsRangeProfitItems: OddsRangeChartItem[] = [];

  ngOnInit(): void {
    this.loadData();
    this.betChange.changed.subscribe(() => this.loadData());
  }

  openNewBet(): void {
    this.newBetDialog.open().subscribe();
  }

  private loadData(): void {
    forkJoin({
      capital: this.api.getCapital(),
      stats: this.api.getBetStats(),
      kpis: this.api.getOddsRangeStats(),
      pending: this.api.getBets({ status: 'PENDING' }),
      allBets: this.api.getBets(),
    }).subscribe(({ capital, stats, kpis, pending, allBets }) => {
      this.capital = capital;
      this.stats = stats;
      this.oddsRangeKpis = kpis;
      this.pendingBets = pending;
      this.allBets = allBets;
      this.buildOddsRangeCharts(kpis);

      if (capital) {
        this.buildCharts(capital, allBets);
      }
    });
  }

  private buildCharts(capital: Capital, bets: Bet[]): void {
    this.capitalChart = buildCapitalEvolutionChart(capital, bets);
    this.initialCapitalChart = buildInitialCapitalChart(capital);
    this.profitChart = buildProfitChart(capital, bets);
    this.monthlyRoiChart = buildMonthlyRoiChart(capital, bets);
    this.averageOddsChart = buildAverageOddsChart(bets);
    this.betsTimelineChart = buildBetsTimelineChart(capital, bets);
  }

  private buildOddsRangeCharts(kpis: OddsRangeKpi[]): void {
    this.oddsRangeVolumeChart = buildOddsRangeVolumeChart(kpis);
    this.oddsRangeProfitChart = buildOddsRangeProfitChart(kpis);
    this.oddsRangeVolumeItems = buildOddsRangeVolumeItems(kpis);
    this.oddsRangeProfitItems = buildOddsRangeProfitItems(kpis);
  }

  get hasOddsRangeCharts(): boolean {
    return !!(this.oddsRangeVolumeChart || this.oddsRangeProfitChart);
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

  get winRate(): number {
    if (!this.stats) {
      return 0;
    }
    const settled = this.stats.won + this.stats.lost;
    if (settled === 0) {
      return 0;
    }
    return (this.stats.won / settled) * 100;
  }

  get settledCount(): number {
    if (!this.stats) {
      return 0;
    }
    return this.stats.won + this.stats.lost;
  }

  get wonSharePercent(): number {
    if (!this.stats || this.settledCount === 0) {
      return 0;
    }
    return Math.round((this.stats.won / this.settledCount) * 100);
  }

  get lostSharePercent(): number {
    if (!this.stats || this.settledCount === 0) {
      return 0;
    }
    return Math.round((this.stats.lost / this.settledCount) * 100);
  }

  get avgOdds(): number {
    if (!this.allBets.length) {
      return 0;
    }
    const sum = this.allBets.reduce((acc, bet) => acc + Number(bet.odds), 0);
    return sum / this.allBets.length;
  }

  potentialWin(bet: Bet): number {
    return betPotentialWin(bet);
  }

  hasSettledBets(kpi: OddsRangeKpi): boolean {
    return kpi.settled > 0;
  }

  betTypeLabel(bet: Bet): string {
    const eventCount = bet.events?.length ?? 0;
    if (eventCount > 1) {
      return 'Multipla';
    }
    if (eventCount === 1) {
      return 'Singola';
    }
    return bet.eventName.includes('+') ? 'Multipla' : 'Singola';
  }
}
