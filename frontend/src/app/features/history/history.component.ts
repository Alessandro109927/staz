import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import { Bet, BetEvent, BetStatus, betPotentialWin } from '../../core/models';
import { groupBetEventsForDisplay } from '../../core/utils/event-form.helpers';
import { BetEventGroupRowComponent } from '../../shared/components/bet-event-group-row/bet-event-group-row.component';
import { VsSelectFieldComponent, VsSelectOption } from '../../shared/vs-select-field/vs-select-field.component';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EditBetDialogService } from './edit-bet-dialog.service';
import {
  DEFAULT_TABLE_PAGE_SIZE,
  clampPage,
  paginateSlice,
} from '../../core/utils/pagination.util';
import { VsTablePaginationComponent } from '../../shared/table-pagination/table-pagination.component';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    BetEventGroupRowComponent,
    VsSelectFieldComponent,
    VsTablePaginationComponent,
  ],
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
  historyPage = 1;
  historyPageSize = DEFAULT_TABLE_PAGE_SIZE;
  statusFilter = new FormControl<BetStatus | 'ALL'>('ALL', { nonNullable: true });

  readonly statusFilterOptions: VsSelectOption[] = [
    { value: 'ALL', label: 'Tutte' },
    { value: 'PENDING', label: 'In attesa' },
    { value: 'WON', label: 'Vinte' },
    { value: 'LOST', label: 'Perse' },
  ];

  ngOnInit(): void {
    this.loadBets();
    this.statusFilter.valueChanges.subscribe(() => {
      this.historyPage = 1;
      this.loadBets();
    });
    this.betChange.changed.subscribe(() => this.loadBets());
  }

  loadBets(): void {
    const status = this.statusFilter.value;
    this.api
      .getBets(status && status !== 'ALL' ? { status } : undefined)
      .subscribe((bets) => {
        this.bets = bets;
        this.historyPage = clampPage(this.historyPage, bets.length, this.historyPageSize);
      });
  }

  get paginatedBets(): Bet[] {
    return paginateSlice(this.bets, this.historyPage, this.historyPageSize);
  }

  onHistoryPageChange(page: number): void {
    this.historyPage = page;
  }

  onHistoryPageSizeChange(pageSize: number): void {
    this.historyPageSize = pageSize;
    this.historyPage = 1;
    this.historyPage = clampPage(this.historyPage, this.bets.length, this.historyPageSize);
  }

  onEventResultChanged(): void {
    this.betChange.notifyChanged();
    this.loadBets();
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
        return 'autorenew';
      case 'WON':
        return 'check';
      case 'LOST':
        return 'close';
    }
  }

  potentialWin(bet: Bet): number {
    return betPotentialWin(bet);
  }

  eventGroups(events: BetEvent[] | null | undefined) {
    return groupBetEventsForDisplay(events ?? []);
  }

  betDay(isoDate: string): string {
    const day = new Date(isoDate).getDate();
    return String(day);
  }

  betMonthShort(isoDate: string): string {
    const months = [
      'Gen',
      'Feb',
      'Mar',
      'Apr',
      'Mag',
      'Giu',
      'Lug',
      'Ago',
      'Set',
      'Ott',
      'Nov',
      'Dic',
    ];
    return months[new Date(isoDate).getMonth()] ?? '';
  }
}
