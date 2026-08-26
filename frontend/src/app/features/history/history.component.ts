import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import { Bet, BetStatus, betPotentialWin } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EditBetDialogService } from './edit-bet-dialog.service';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MatDialogModule, MatSnackBarModule],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
})
export class HistoryComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly betChange = inject(BetChangeService);
  private readonly editBetDialog = inject(EditBetDialogService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  bets: Bet[] = [];
  statusFilter = new FormControl<BetStatus | 'ALL'>('ALL');

  ngOnInit(): void {
    this.loadBets();
    this.statusFilter.valueChanges.subscribe(() => this.loadBets());
    this.betChange.changed.subscribe(() => this.loadBets());
  }

  loadBets(): void {
    const status = this.statusFilter.value;
    this.api
      .getBets(status && status !== 'ALL' ? { status } : undefined)
      .subscribe((bets) => (this.bets = bets));
  }

  editBet(bet: Bet): void {
    this.editBetDialog.open(bet).subscribe((saved) => {
      if (saved) {
        this.loadBets();
      }
    });
  }

  deleteBet(bet: Bet): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Elimina scommessa',
        message: `Eliminare la scommessa "${bet.eventName}"? Il capitale verrà ricalcolato.`,
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }

      this.api.deleteBet(bet.id).subscribe({
        next: () => {
          this.snackBar.open('Scommessa eliminata', 'OK', { duration: 3000 });
          this.betChange.notifyChanged();
          this.loadBets();
        },
        error: (err) => {
          this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
        },
      });
    });
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

  statusLabel(status: BetStatus): string {
    switch (status) {
      case 'PENDING':
        return 'In attesa';
      case 'WON':
        return 'Vinta';
      case 'LOST':
        return 'Persa';
    }
  }

  statusBadgeClass(status: BetStatus): string {
    switch (status) {
      case 'PENDING':
        return 'vs-badge vs-badge--neutral';
      case 'WON':
        return 'vs-badge vs-badge--success';
      case 'LOST':
        return 'vs-badge vs-badge--danger';
    }
  }

  statusIcon(status: BetStatus): string {
    switch (status) {
      case 'PENDING':
        return 'hourglass_empty';
      case 'WON':
        return 'check_circle';
      case 'LOST':
        return 'cancel';
    }
  }

  potentialWin(bet: Bet): number {
    return betPotentialWin(bet);
  }
}
