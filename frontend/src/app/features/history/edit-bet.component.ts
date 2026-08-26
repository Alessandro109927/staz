import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
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
import { Bet, BetEventItem, BetStatus, combineOdds } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

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
  ],
  templateUrl: './edit-bet.component.html',
  styleUrls: ['./edit-bet.component.scss', '../new-bet/new-bet.component.scss'],
})
export class EditBetComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<EditBetComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly betChange = inject(BetChangeService);
  private readonly data = inject<{ bet: Bet }>(MAT_DIALOG_DATA);
  private readonly destroy$ = new Subject<void>();

  readonly bet = this.data.bet;
  initialCapital: number | null = null;

  form = this.fb.group({
    betDate: ['', Validators.required],
    status: ['PENDING' as BetStatus, Validators.required],
    events: this.fb.array([]),
    stakePercentage: [null as number | null, [Validators.required, Validators.min(0.01)]],
    amountStaked: [null as number | null, [Validators.required, Validators.min(0.01)]],
    potentialWin: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  constructor() {
    this.loadBet(this.bet);
    this.loadInitialCapital();
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
    if (this.form.invalid) {
      return;
    }

    const { betDate, status, stakePercentage, amountStaked, potentialWin } =
      this.form.getRawValue();
    const events = this.events.getRawValue() as BetEventItem[];

    this.api
      .updateBet(this.bet.id, {
        events,
        betDate: new Date(betDate!).toISOString(),
        status: status!,
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
        ? [...bet.events].sort((a, b) => a.sortOrder - b.sortOrder)
        : [{ eventName: bet.eventName, outcome: '', odds: bet.odds, sortOrder: 0, id: 0 }];

    for (const event of sourceEvents) {
      this.events.push(
        this.fb.group({
          eventName: [event.eventName, Validators.required],
          outcome: [event.outcome ?? '', Validators.required],
          odds: [Number(event.odds), [Validators.required, Validators.min(1.01)]],
        }),
      );
    }

    const amount = Number(bet.amountStaked);

    this.form.patchValue({
      betDate: bet.betDate.slice(0, 10),
      status: bet.status,
      stakePercentage: Number(bet.stakePercentageApplied),
      amountStaked: amount,
      potentialWin: Number(bet.potentialWin),
    });
  }

  private loadInitialCapital(): void {
    this.api.getCapital().subscribe((capital) => {
      this.initialCapital = capital ? Number(capital.initialCapital) : null;
    });
  }

  private createEventGroup() {
    return this.fb.group({
      eventName: ['', Validators.required],
      outcome: ['', Validators.required],
      odds: [1.75, [Validators.required, Validators.min(1.01)]],
    });
  }
}
