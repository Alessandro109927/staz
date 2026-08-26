import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  filter,
  switchMap,
  takeUntil,
} from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import { BetEventItem, StakePreview, combineOdds } from '../../core/models';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

@Component({
  selector: 'app-new-bet',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatSnackBarModule,
    MatIconModule,
  ],
  templateUrl: './new-bet.component.html',
  styleUrl: './new-bet.component.scss',
})
export class NewBetComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<NewBetComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly betChange = inject(BetChangeService);
  private readonly destroy$ = new Subject<void>();
  private stakeSyncLock = false;

  preview: StakePreview | null = null;
  previewError: string | null = null;

  form = this.fb.group({
    betDate: [new Date().toISOString().slice(0, 10), Validators.required],
    events: this.fb.array([this.createEventGroup()]),
    stakePercentage: [
      { value: null as number | null, disabled: true },
      [Validators.required, Validators.min(0.01)],
    ],
    amountStaked: [
      { value: null as number | null, disabled: true },
      [Validators.required, Validators.min(0.01)],
    ],
    potentialWin: [
      { value: null as number | null, disabled: true },
      [Validators.required, Validators.min(0.01)],
    ],
  });

  constructor() {
    this.setupStakePreview();
  }

  get events(): FormArray {
    return this.form.controls.events;
  }

  get combinedOdds(): number | null {
    return combineOdds(this.events.getRawValue() as BetEventItem[]);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  addEvent(): void {
    this.events.push(this.createEventGroup());
  }

  removeEvent(index: number): void {
    if (this.events.length === 1) {
      return;
    }
    this.events.removeAt(index);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  submit(): void {
    if (this.form.invalid || !this.preview) {
      return;
    }

    const { betDate, stakePercentage, amountStaked, potentialWin } = this.form.getRawValue();
    const events = this.events.getRawValue() as BetEventItem[];

    this.api
      .createBet({
        events,
        betDate: new Date(betDate!).toISOString(),
        stakePercentageApplied: Number(stakePercentage),
        amountStaked: Number(amountStaked),
        potentialWin: Number(potentialWin),
      })
      .subscribe({
        next: () => {
          this.snackBar.open('Scommessa registrata', 'OK', { duration: 3000 });
          this.betChange.notifyCreated();
          this.dialogRef.close(true);
        },
        error: (err) => {
          this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
        },
      });
  }

  private createEventGroup() {
    return this.fb.group({
      eventName: ['', Validators.required],
      outcome: ['', Validators.required],
      odds: [1.75, [Validators.required, Validators.min(1.01)]],
    });
  }

  private setupStakePreview(): void {
    this.events.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
        filter((events) => this.isValidEvents(events)),
        switchMap((events) => this.api.calculateStake(events as BetEventItem[])),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (preview) => this.applyPreview(preview),
        error: (err) => {
          this.preview = null;
          this.previewError = err.error?.message ?? 'Impossibile calcolare lo stake';
          this.disableStakeFields();
        },
      });

    this.refreshStakePreview();
  }

  private applyPreview(preview: StakePreview): void {
    this.preview = preview;
    this.previewError = null;

    const odds = Number(preview.combinedOdds);
    const amount = Number(preview.amountStaked);

    this.stakeSyncLock = true;
    this.form.patchValue(
      {
        stakePercentage: Number(preview.stakePercentage),
        amountStaked: amount,
        potentialWin: roundMoney(amount * odds),
      },
      { emitEvent: false },
    );
    this.enableStakeFields();
    this.stakeSyncLock = false;
  }

  private enableStakeFields(): void {
    this.form.controls.stakePercentage.enable({ emitEvent: false });
    this.form.controls.amountStaked.enable({ emitEvent: false });
    this.form.controls.potentialWin.enable({ emitEvent: false });
  }

  private disableStakeFields(): void {
    this.stakeSyncLock = true;
    this.form.patchValue(
      { stakePercentage: null, amountStaked: null, potentialWin: null },
      { emitEvent: false },
    );
    this.form.controls.stakePercentage.disable({ emitEvent: false });
    this.form.controls.amountStaked.disable({ emitEvent: false });
    this.form.controls.potentialWin.disable({ emitEvent: false });
    this.stakeSyncLock = false;
  }

  private refreshStakePreview(): void {
    const initialEvents = this.events.getRawValue();
    if (this.isValidEvents(initialEvents)) {
      this.api.calculateStake(initialEvents as BetEventItem[]).subscribe({
        next: (preview) => this.applyPreview(preview),
        error: (err) => {
          this.previewError = err.error?.message ?? 'Impossibile calcolare lo stake';
          this.disableStakeFields();
        },
      });
    }
  }

  private isValidEvents(
    events: Array<{ eventName?: string | null; outcome?: string | null; odds?: number | null }>,
  ): boolean {
    return (
      events.length > 0 &&
      events.every(
        (event) =>
          !!event.eventName?.trim() &&
          !!event.outcome?.trim() &&
          event.odds != null &&
          event.odds > 1,
      )
    );
  }
}
