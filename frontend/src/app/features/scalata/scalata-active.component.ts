import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/services/api.service';
import { ScalataRun, ScalataRunStep } from '../../core/models';
import { formatRiskLabel, formatBetLabel } from './scalata.helpers';

@Component({
  selector: 'app-scalata-active',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  templateUrl: './scalata-active.component.html',
  styleUrl: './scalata-active.component.scss',
})
export class ScalataActiveComponent implements OnInit {
  private readonly api = inject(ApiService);

  activeRuns: ScalataRun[] = [];
  finishedRuns: ScalataRun[] = [];
  loading = true;
  readonly formatRiskLabel = formatRiskLabel;
  readonly formatBetLabel = formatBetLabel;

  ngOnInit(): void {
    this.loadRuns();
  }

  private loadRuns(): void {
    this.loading = true;
    this.api.getScalataRuns().subscribe({
      next: (runs) => {
        this.activeRuns = runs.filter((run) => run.status === 'ACTIVE');
        this.finishedRuns = runs.filter((run) => run.status !== 'ACTIVE');
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  currentStep(run: ScalataRun): ScalataRunStep | undefined {
    return run.steps.find((step) => step.isCurrent) ?? run.steps[run.currentDay - 1];
  }

  lastWonStep(run: ScalataRun): ScalataRunStep | null {
    const wonSteps = run.steps.filter((step) => step.status === 'WON');
    return wonSteps.length ? wonSteps[wonSteps.length - 1] : null;
  }

  runProfit(run: ScalataRun): number {
    const step = this.lastWonStep(run);
    return step ? Number(step.cumulativeProfit) : 0;
  }

  isEarlyCompletion(run: ScalataRun): boolean {
    return run.status === 'COMPLETED' && run.completedSteps < run.totalDays;
  }

  statusLabel(run: ScalataRun): string {
    switch (run.status) {
      case 'ACTIVE':
        return 'In corso';
      case 'COMPLETED':
        return this.isEarlyCompletion(run) ? 'Staccata' : 'Completata';
      case 'FAILED':
        return 'Fallita';
      default:
        return 'Abbandonata';
    }
  }

  statusClass(run: ScalataRun): string {
    switch (run.status) {
      case 'COMPLETED':
        return 'scalata-active-card__badge--completed';
      case 'FAILED':
        return 'scalata-active-card__badge--failed';
      case 'ABANDONED':
        return 'scalata-active-card__badge--abandoned';
      default:
        return '';
    }
  }

  cardClass(run: ScalataRun): Record<string, boolean> {
    return {
      'scalata-active-card--completed': run.status === 'COMPLETED',
      'scalata-active-card--failed': run.status === 'FAILED',
      'scalata-active-card--abandoned': run.status === 'ABANDONED',
    };
  }

  finishedSummary(run: ScalataRun): string {
    const won = run.completedSteps;
    const total = run.totalDays;

    if (run.status === 'COMPLETED') {
      if (this.isEarlyCompletion(run)) {
        return `${won} bet vinte su ${total} · chiusa in anticipo`;
      }
      return `Obiettivo raggiunto · ${won} bet su ${total}`;
    }

    if (run.status === 'FAILED') {
      return `Interrotta alla ${formatBetLabel(run.currentDay)} · ${won} bet vinte`;
    }

    return `${won} bet vinte su ${total}`;
  }
}
