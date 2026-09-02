import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import {
  ScalataDaysMode,
  ScalataInput,
  ScalataOddsStrategy,
  ScalataPlan,
  buildScalataPlan,
  formatBetLabel,
  formatRiskLabel,
} from './scalata.helpers';

type StakeSource = 'manual' | 'capital' | 'system';

@Component({
  selector: 'app-scalata',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MatSnackBarModule, RouterLink],
  templateUrl: './scalata.component.html',
  styleUrl: './scalata.component.scss',
})
export class ScalataComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  plan: ScalataPlan | null = null;
  stakeSource: StakeSource = 'manual';
  currentCapital: number | null = null;
  systemSuggestedStake: number | null = null;
  loadingSuggestion = false;
  startingScalata = false;
  activeRunsCount = 0;

  readonly form = this.fb.nonNullable.group({
    startBankroll: [10, [Validators.required, Validators.min(0.01)]],
    targetProfit: [250, [Validators.required, Validators.min(0.01)]],
    daysMode: ['auto' as ScalataDaysMode, Validators.required],
    days: [{ value: 20, disabled: true }, [Validators.required, Validators.min(1), Validators.max(90)]],
    maxDailyOdds: [2, [Validators.required, Validators.min(1.01)]],
    minDailyOdds: [1.1, [Validators.required, Validators.min(1.01)]],
    oddsStrategy: ['decreasing' as ScalataOddsStrategy, Validators.required],
  });

  readonly formatRiskLabel = formatRiskLabel;
  readonly formatBetLabel = formatBetLabel;

  ngOnInit(): void {
    this.loadCapital();
    this.loadSystemSuggestion();
    this.loadActiveRuns();
    this.form.valueChanges.subscribe(() => this.recalculate());
    this.recalculate();
  }

  startScalata(): void {
    if (!this.plan?.feasible || this.form.invalid || this.startingScalata) {
      return;
    }

    const raw = this.form.getRawValue();
    this.startingScalata = true;

    this.api
      .createScalataRun({
        startBankroll: raw.startBankroll,
        targetProfit: raw.targetProfit,
        daysMode: raw.daysMode,
        days: raw.days,
        maxDailyOdds: raw.maxDailyOdds,
        minDailyOdds: raw.minDailyOdds,
        oddsStrategy: raw.oddsStrategy,
      })
      .subscribe({
        next: (run) => {
          this.startingScalata = false;
          this.snackBar.open('Scalata avviata', 'OK', { duration: 3000 });
          this.router.navigate(['/scalata', run.id]);
        },
        error: (err) => {
          this.startingScalata = false;
          this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
        },
      });
  }

  setStakeSource(source: StakeSource): void {
    this.stakeSource = source;

    if (source === 'capital' && this.currentCapital != null) {
      this.form.patchValue({ startBankroll: this.currentCapital });
    }

    if (source === 'system' && this.systemSuggestedStake != null) {
      this.form.patchValue({ startBankroll: this.systemSuggestedStake });
    }
  }

  onDaysModeChange(): void {
    const mode = this.form.controls.daysMode.value;
    if (mode === 'auto') {
      this.form.controls.days.disable({ emitEvent: false });
    } else {
      this.form.controls.days.enable({ emitEvent: false });
    }
    this.recalculate();
  }

  progressPercent(stepIndex: number): number {
    if (!this.plan?.feasible || !this.plan.targetProfit) {
      return 0;
    }
    const step = this.plan.steps[stepIndex];
    return clampPercent((step.cumulativeProfit / this.plan.targetProfit) * 100);
  }

  overallProgress(): number {
    if (!this.plan?.feasible || !this.plan.steps.length) {
      return 0;
    }
    const last = this.plan.steps.at(-1);
    if (!last) {
      return 0;
    }
    return clampPercent((last.cumulativeProfit / this.plan.targetProfit) * 100);
  }

  private recalculate(): void {
    if (this.form.invalid) {
      this.plan = null;
      return;
    }

    const raw = this.form.getRawValue();
    const input: ScalataInput = {
      startBankroll: raw.startBankroll,
      targetProfit: raw.targetProfit,
      daysMode: raw.daysMode,
      days: raw.days,
      maxDailyOdds: raw.maxDailyOdds,
      minDailyOdds: raw.minDailyOdds,
      oddsStrategy: raw.oddsStrategy,
    };

    this.plan = buildScalataPlan(input);
  }

  private loadSystemSuggestion(): void {
    this.loadingSuggestion = true;
    const referenceOdds = this.form.controls.minDailyOdds.value;

    this.api
      .calculateStake([
        {
          eventName: 'Scalata',
          outcome: '1',
          odds: referenceOdds,
        },
      ])
      .subscribe({
        next: (preview) => {
          this.systemSuggestedStake = Number(preview.amountStaked);
          this.loadingSuggestion = false;
        },
        error: () => {
          this.loadingSuggestion = false;
        },
      });
  }

  private loadCapital(): void {
    this.api.getCapital().subscribe((capital) => {
      this.currentCapital = capital ? Number(capital.currentCapital) : null;
    });
  }

  private loadActiveRuns(): void {
    this.api.getScalataRuns('ACTIVE').subscribe({
      next: (runs) => {
        this.activeRunsCount = runs.length;
      },
      error: () => {
        this.activeRunsCount = 0;
      },
    });
  }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}
