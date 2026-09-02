import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import {
  BetEventItem,
  BetStatus,
  ScalataRun,
  ScalataRunStep,
  combineOdds,
} from '../../core/models';
import { formatBetLabel, formatRiskLabel, parseOddsInput } from './scalata.helpers';

function oddsValidator(control: AbstractControl): ValidationErrors | null {
  const odds = parseOddsInput(control.value);
  if (!Number.isFinite(odds) || odds < 1.01) {
    return { odds: true };
  }
  return null;
}

@Component({
  selector: 'app-scalata-run',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './scalata-run.component.html',
  styleUrl: './scalata-run.component.scss',
})
export class ScalataRunComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly betChange = inject(BetChangeService);

  run: ScalataRun | null = null;
  loading = true;
  submitting = false;
  cashingOut = false;
  formStepId: number | null = null;
  selectedStepId: number | null = null;
  readonly formatRiskLabel = formatRiskLabel;
  readonly formatBetLabel = formatBetLabel;

  readonly form = this.fb.group({
    betDate: [new Date().toISOString().slice(0, 10), Validators.required],
    events: this.fb.array([this.createEventGroup(1.75)]),
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (id) {
        this.loadRun(id);
      }
    });
  }

  get events(): FormArray {
    return this.form.controls.events;
  }

  get combinedOdds(): number | null {
    const events = (this.events.getRawValue() as BetEventItem[]).map((event) => ({
      ...event,
      odds: parseOddsInput(event.odds),
    }));
    return combineOdds(events);
  }

  get currentStep(): ScalataRunStep | null {
    if (!this.run) {
      return null;
    }
    return this.run.steps.find((step) => step.isCurrent) ?? null;
  }

  get displayStep(): ScalataRunStep | null {
    if (!this.run) {
      return null;
    }
    if (this.selectedStepId !== null) {
      return this.run.steps.find((step) => step.id === this.selectedStepId) ?? null;
    }
    return this.currentStep;
  }

  get isActive(): boolean {
    return this.run?.status === 'ACTIVE';
  }

  get canEditStep(): boolean {
    return this.isActive && !!this.displayStep?.isCurrent;
  }

  get showMainPanel(): boolean {
    return !!this.displayStep && (this.isActive || this.selectedStepId !== null);
  }

  get isViewingPastStep(): boolean {
    return this.selectedStepId !== null && !this.displayStep?.isCurrent;
  }

  get wonStepsCount(): number {
    return this.run?.steps.filter((step) => step.status === 'WON').length ?? 0;
  }

  get lastWonStep(): ScalataRunStep | null {
    if (!this.run) {
      return null;
    }
    const wonSteps = this.run.steps.filter((step) => step.status === 'WON');
    return wonSteps.length ? wonSteps[wonSteps.length - 1] : null;
  }

  get displayProfit(): number {
    return this.lastWonStep ? Number(this.lastWonStep.cumulativeProfit) : 0;
  }

  get displayRoi(): number {
    if (!this.run) {
      return 0;
    }
    const start = Number(this.run.startBankroll);
    return start > 0 ? (this.displayProfit / start) * 100 : 0;
  }

  get isEarlyCompletion(): boolean {
    return (
      this.run?.status === 'COMPLETED' &&
      this.run.completedSteps < this.run.totalDays
    );
  }

  addEvent(): void {
    const defaultOdds = this.currentStep
      ? parseOddsInput(this.currentStep.plannedOdds)
      : 1.75;
    this.events.push(this.createEventGroup(defaultOdds));
  }

  removeEvent(index: number): void {
    if (this.events.length === 1) {
      return;
    }
    this.events.removeAt(index);
  }

  selectTimelineStep(step: ScalataRunStep): void {
    this.selectedStepId = step.id;
    if (step.isCurrent && this.isActive) {
      this.prefillFormForStep(step, false);
    }
  }

  goToCurrentStep(): void {
    this.selectedStepId = null;
    const step = this.currentStep;
    if (step && this.isActive) {
      this.prefillFormForStep(step, false);
    }
  }

  submitStep(status: BetStatus): void {
    const step = this.currentStep;
    if (!this.run || !step || this.submitting) {
      return;
    }

    this.normalizeOddsFields();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Compila evento, esito e quota prima di continuare', 'Chiudi', {
        duration: 4000,
      });
      return;
    }

    this.submitting = true;
    const { betDate } = this.form.getRawValue();
    const events = (this.events.getRawValue() as BetEventItem[]).map((event) => ({
      eventName: event.eventName.trim(),
      outcome: event.outcome.trim(),
      odds: parseOddsInput(event.odds),
    }));

    this.api
      .submitScalataStep(this.run.id, step.id, {
        events,
        betDate: new Date(`${betDate}T12:00:00`).toISOString(),
        status,
      })
      .pipe(
        finalize(() => {
          this.submitting = false;
        }),
      )
      .subscribe({
        next: (run) => {
          this.run = run;
          this.selectedStepId = null;
          this.betChange.notifyCreated();

          if (status === 'WON') {
            this.snackBar.open(`${formatBetLabel(step.day)} completata`, 'OK', {
              duration: 3000,
            });
          } else if (status === 'LOST') {
            this.snackBar.open(`${formatBetLabel(step.day)} persa`, 'Chiudi', {
              duration: 5000,
            });
          } else {
            this.snackBar.open(`${formatBetLabel(step.day)} salvata (in attesa)`, 'OK', {
              duration: 3000,
            });
          }

          if (run.status === 'COMPLETED') {
            this.snackBar.open('Obiettivo raggiunto!', 'OK', { duration: 5000 });
            return;
          }

          if (run.status === 'FAILED') {
            this.snackBar.open('Scalata fallita', 'Chiudi', { duration: 5000 });
            return;
          }

          const nextStep = this.currentStep;
          if (!nextStep) {
            return;
          }

          this.prefillFormForStep(nextStep, status === 'WON');
        },
        error: (err) => {
          this.snackBar.open(err.error?.message ?? 'Errore nel salvataggio della bet', 'Chiudi', {
            duration: 5000,
          });
        },
      });
  }

  cashOutRun(): void {
    if (!this.run || this.cashingOut) {
      return;
    }

    const profit = this.displayProfit;
    const message =
      `Hai vinto ${this.wonStepsCount} bet con un profitto di +€ ${profit.toFixed(2)}.\n` +
      'Vuoi staccare la scalata qui e chiuderla in anticipo?';

    if (!confirm(message)) {
      return;
    }

    this.cashingOut = true;
    this.api
      .cashOutScalataRun(this.run.id)
      .pipe(
        finalize(() => {
          this.cashingOut = false;
        }),
      )
      .subscribe({
        next: (run) => {
          this.run = run;
          this.selectedStepId = null;
          this.betChange.notifyCreated();
          this.snackBar.open('Scalata staccata con successo', 'OK', { duration: 4000 });
        },
        error: (err) => {
          this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
        },
      });
  }

  abandonRun(): void {
    if (!this.run || !confirm('Vuoi abbandonare questa scalata?')) {
      return;
    }

    this.api.abandonScalataRun(this.run.id).subscribe({
      next: () => {
        this.snackBar.open('Scalata abbandonata', 'OK', { duration: 3000 });
        this.router.navigate(['/scalata/active']);
      },
      error: (err) => {
        this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
      },
    });
  }

  stepClass(step: ScalataRunStep): Record<string, boolean> {
    return {
      'scalata-run-step--won': step.status === 'WON',
      'scalata-run-step--lost': step.status === 'LOST',
      'scalata-run-step--current': step.isCurrent,
      'scalata-run-step--locked': step.isLocked,
      'scalata-run-step--selected': step.id === this.selectedStepId,
    };
  }

  stepStatusLabel(step: ScalataRunStep): string {
    if (step.status === 'WON') {
      return 'Vinta';
    }
    if (step.status === 'LOST') {
      return 'Persa';
    }
    if (step.isCurrent) {
      return 'Corrente';
    }
    if (step.isLocked) {
      return 'In attesa';
    }
    return 'Da chiudere';
  }

  statusLabel(status: ScalataRun['status']): string {
    switch (status) {
      case 'ACTIVE':
        return 'In corso';
      case 'COMPLETED':
        return 'Completata';
      case 'FAILED':
        return 'Fallita';
      default:
        return 'Abbandonata';
    }
  }

  private loadRun(id: number): void {
    this.loading = true;
    this.selectedStepId = null;
    this.api.getScalataRun(id).subscribe({
      next: (run) => {
        this.run = run;
        this.loading = false;
        const step = run.steps.find((item) => item.isCurrent);
        if (step && run.status === 'ACTIVE') {
          this.prefillFormForStep(step, false);
        }
      },
      error: () => {
        this.loading = false;
        this.router.navigate(['/scalata/active']);
      },
    });
  }

  private prefillFormForStep(step: ScalataRunStep, freshStep: boolean): void {
    const hasPendingDraft =
      !freshStep &&
      step.bet?.status === 'PENDING' &&
      !!step.bet.events?.length;

    if (hasPendingDraft && step.bet) {
      this.form.setControl(
        'events',
        this.fb.array(
          step.bet.events.map((event) =>
            this.createEventGroup(
              parseOddsInput(event.odds),
              event.eventName,
              (event.outcome ?? '').trim() || '1',
            ),
          ),
        ),
      );
      this.form.patchValue({
        betDate: step.bet.betDate.slice(0, 10),
      });
    } else {
      this.form.setControl(
        'events',
        this.fb.array([this.createEventGroup(parseOddsInput(step.plannedOdds))]),
      );
      this.form.patchValue({
        betDate: new Date().toISOString().slice(0, 10),
      });
    }

    this.formStepId = step.id;
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.form.updateValueAndValidity();
  }

  private normalizeOddsFields(): void {
    for (const control of this.events.controls) {
      const oddsControl = control.get('odds');
      if (!oddsControl) {
        continue;
      }
      const parsed = parseOddsInput(oddsControl.value);
      if (Number.isFinite(parsed)) {
        oddsControl.setValue(parsed, { emitEvent: false });
      }
    }
  }

  private createEventGroup(odds: number, eventName = '', outcome = '') {
    const parsedOdds = parseOddsInput(odds);
    return this.fb.group({
      eventName: [eventName, Validators.required],
      outcome: [outcome, Validators.required],
      odds: [parsedOdds, [Validators.required, oddsValidator]],
    });
  }
}
