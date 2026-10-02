import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
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
import {
  BetEventItem,
  OutcomeOption,
  StakePreview,
  combineOdds,
} from '../../core/models';
import { OutcomeOptionsService } from '../../core/services/outcome-options.service';
import { createEventGroupForm, createEventPickGroup } from '../../core/utils/event-form.factory';
import {
  EventGroupFormValue,
  flattenEventGroups,
  isValidEventGroups,
  syncEventGroupsScorerValidators,
} from '../../core/utils/event-form.helpers';
import { isScorerOutcomeLabel } from '../../core/utils/outcome-option.util';
import { MatchTeamsFieldComponent } from '../../shared/match-teams-field/match-teams-field.component';
import { OutcomeFieldComponent } from '../../shared/outcome-field/outcome-field.component';

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
    MatchTeamsFieldComponent,
    OutcomeFieldComponent,
  ],
  templateUrl: './new-bet.component.html',
  styleUrl: './new-bet.component.scss',
})
export class NewBetComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly outcomeOptionsService = inject(OutcomeOptionsService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<NewBetComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly betChange = inject(BetChangeService);
  private readonly destroy$ = new Subject<void>();
  private stakeSyncLock = false;

  preview: StakePreview | null = null;
  previewError: string | null = null;
  outcomeOptions: OutcomeOption[] = [];
  readonly isScorerOutcomeLabel = isScorerOutcomeLabel;

  form = this.fb.group({
    events: this.fb.array([createEventGroupForm(this.fb)]),
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

  ngOnInit(): void {
    this.outcomeOptionsService.load().subscribe((options) => {
      this.outcomeOptions = options;
      syncEventGroupsScorerValidators(this.events, this.outcomeOptions);
    });

    this.events.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      syncEventGroupsScorerValidators(this.events, this.outcomeOptions);
    });
  }

  get events(): FormArray {
    return this.form.controls.events;
  }

  get flattenedPickCount(): number {
    return this.flattenEvents().length;
  }

  get combinedOdds(): number | null {
    return combineOdds(this.flattenEvents());
  }

  get displayOdds(): number | null {
    if (this.preview?.combinedOdds != null) {
      return Number(this.preview.combinedOdds);
    }
    return this.combinedOdds;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  picksAt(eventIndex: number): FormArray {
    return this.events.at(eventIndex).get('picks') as FormArray;
  }

  addEvent(): void {
    this.events.push(createEventGroupForm(this.fb));
  }

  removeEvent(index: number): void {
    if (this.events.length === 1) {
      return;
    }
    this.events.removeAt(index);
  }

  addPick(eventIndex: number): void {
    this.picksAt(eventIndex).push(createEventPickGroup(this.fb));
  }

  removePick(eventIndex: number, pickIndex: number): void {
    const picks = this.picksAt(eventIndex);
    if (picks.length === 1) {
      return;
    }
    picks.removeAt(pickIndex);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  submit(): void {
    if (this.form.invalid || !this.preview) {
      return;
    }

    const { stakePercentage, amountStaked, potentialWin } = this.form.getRawValue();
    const events = this.flattenEvents();
    const today = new Date().toISOString().slice(0, 10);

    this.api
      .createBet({
        events,
        betDate: new Date(`${today}T12:00:00`).toISOString(),
        status: 'PENDING',
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

  private flattenEvents(): BetEventItem[] {
    return flattenEventGroups(
      this.events.getRawValue() as EventGroupFormValue[],
      this.outcomeOptions,
    );
  }

  private setupStakePreview(): void {
    this.events.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
        filter((groups) =>
          isValidEventGroups(groups as EventGroupFormValue[], this.outcomeOptions),
        ),
        switchMap((groups) =>
          this.api.calculateStake(
            flattenEventGroups(groups as EventGroupFormValue[], this.outcomeOptions),
          ),
        ),
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
    const groups = this.events.getRawValue() as EventGroupFormValue[];
    if (isValidEventGroups(groups, this.outcomeOptions)) {
      this.api.calculateStake(flattenEventGroups(groups, this.outcomeOptions)).subscribe({
        next: (preview) => this.applyPreview(preview),
        error: (err) => {
          this.previewError = err.error?.message ?? 'Impossibile calcolare lo stake';
          this.disableStakeFields();
        },
      });
    }
  }
}
