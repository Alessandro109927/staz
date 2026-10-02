import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, takeUntil } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import { Bet, BetEventItem, OutcomeOption, combineOdds } from '../../core/models';
import { OutcomeOptionsService } from '../../core/services/outcome-options.service';
import { createEventGroupForm, createEventPickGroup } from '../../core/utils/event-form.factory';
import {
  EventGroupFormValue,
  flattenEventGroups,
  groupBetEventsForForm,
  syncEventGroupsScorerValidators,
} from '../../core/utils/event-form.helpers';
import { isScorerOutcomeLabel } from '../../core/utils/outcome-option.util';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { MatchTeamsFieldComponent } from '../../shared/match-teams-field/match-teams-field.component';
import { OutcomeFieldComponent } from '../../shared/outcome-field/outcome-field.component';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

@Component({
  selector: 'app-edit-bet',
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
  templateUrl: './edit-bet.component.html',
  styleUrls: ['./edit-bet.component.scss', '../new-bet/new-bet.component.scss'],
})
export class EditBetComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly outcomeOptionsService = inject(OutcomeOptionsService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<EditBetComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly betChange = inject(BetChangeService);
  private readonly data = inject<{ bet: Bet }>(MAT_DIALOG_DATA);
  private readonly destroy$ = new Subject<void>();

  readonly bet = this.data.bet;
  outcomeOptions: OutcomeOption[] = [];
  readonly isScorerOutcomeLabel = isScorerOutcomeLabel;

  form = this.fb.group({
    events: this.fb.array([]),
    stakePercentage: [null as number | null, [Validators.required, Validators.min(0.01)]],
    amountStaked: [null as number | null, [Validators.required, Validators.min(0.01)]],
    potentialWin: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  ngOnInit(): void {
    this.outcomeOptionsService.load().subscribe((options) => {
      this.outcomeOptions = options;
      this.loadBet(this.bet);
      syncEventGroupsScorerValidators(this.events, this.outcomeOptions);
    });

    this.events.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      syncEventGroupsScorerValidators(this.events, this.outcomeOptions);
    });
  }

  get events(): FormArray {
    return this.form.controls.events;
  }

  get combinedOdds(): number | null {
    return combineOdds(this.flattenEvents());
  }

  get flattenedPickCount(): number {
    return this.flattenEvents().length;
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
    if (this.form.invalid) {
      return;
    }

    const { stakePercentage, amountStaked, potentialWin } = this.form.getRawValue();
    const events = this.flattenEvents();

    this.api
      .updateBet(this.bet.id, {
        events,
        betDate: this.bet.betDate,
        status: this.bet.status,
        stakePercentageApplied: Number(stakePercentage),
        amountStaked: Number(amountStaked),
        potentialWin: Number(potentialWin),
      })
      .subscribe({
        next: () => {
          this.snackBar.open('Scommessa aggiornata', 'OK', { duration: 3000 });
          this.betChange.notifyChanged();
          this.dialogRef.close(true);
        },
        error: (err) => {
          this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
        },
      });
  }

  deleteBet(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Elimina scommessa',
        message: `Eliminare la scommessa "${this.bet.eventName}"?`,
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }

      this.api.deleteBet(this.bet.id).subscribe({
        next: () => {
          this.snackBar.open('Scommessa eliminata', 'OK', { duration: 3000 });
          this.betChange.notifyChanged();
          this.dialogRef.close(true);
        },
        error: (err) => {
          this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
        },
      });
    });
  }

  private loadBet(bet: Bet): void {
    const sourceEvents =
      bet.events?.length > 0
        ? [...bet.events]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((event) => ({
              eventName: event.eventName,
              outcome: event.outcome ?? '',
              odds: Number(event.odds),
            }))
        : [{ eventName: bet.eventName, outcome: '', odds: Number(bet.odds) }];

    while (this.events.length) {
      this.events.removeAt(0);
    }

    const grouped = groupBetEventsForForm(sourceEvents, this.outcomeOptions);

    for (const group of grouped) {
      this.events.push(createEventGroupForm(this.fb, group.eventName, group.picks));
    }

    const amount = Number(bet.amountStaked);

    this.form.patchValue({
      stakePercentage: Number(bet.stakePercentageApplied),
      amountStaked: amount,
      potentialWin: Number(bet.potentialWin),
    });
  }

  private flattenEvents(): BetEventItem[] {
    return flattenEventGroups(
      this.events.getRawValue() as EventGroupFormValue[],
      this.outcomeOptions,
    );
  }
}
