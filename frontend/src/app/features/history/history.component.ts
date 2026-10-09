import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import {
  Bet,
  BetEvent,
  BetStats,
  BetStatus,
  Capital,
  betPotentialWin,
  profitFromCapital,
  startingCapitalValue,
} from '../../core/models';
import { groupBetEventsForDisplay } from '../../core/utils/event-form.helpers';
import { BetEventGroupRowComponent } from '../../shared/components/bet-event-group-row/bet-event-group-row.component';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { EditBetDialogService } from './edit-bet-dialog.service';
import { NewBetDialogService } from '../new-bet/new-bet-dialog.service';
import {
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
    VsTablePaginationComponent,
  ],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
})
export class HistoryComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly betChange = inject(BetChangeService);
  private readonly editBetDialog = inject(EditBetDialogService);
  private readonly newBetDialog = inject(NewBetDialogService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  bets: Bet[] = [];
  capital: Capital | null = null;
  stats: BetStats | null = null;
  historyPage = 1;
  historyPageSize = 5;
  statusFilter = new FormControl<BetStatus | 'ALL'>('ALL', { nonNullable: true });

  ngOnInit(): void {
    this.refresh();
    this.statusFilter.valueChanges.subscribe(() => {
      this.historyPage = 1;
      this.loadBets();
    });
    this.betChange.changed.subscribe(() => this.refresh());
  }

  refresh(): void {
    forkJoin({
      capital: this.api.getCapital(),
      stats: this.api.getBetStats(),
    }).subscribe(({ capital, stats }) => {
      this.capital = capital;
      this.stats = stats;
    });
    this.loadBets();
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

  setStatusTab(status: BetStatus | 'ALL'): void {
    this.statusFilter.setValue(status);
  }

  activeStatusTab(): BetStatus | 'ALL' {
    return this.statusFilter.value;
  }

  onEventResultChanged(): void {
    this.betChange.notifyChanged();
    this.refresh();
  }

  openNewBet(): void {
    this.newBetDialog.open().subscribe((saved) => {
      if (saved) {
        this.refresh();
      }
    });
  }

  exportCsv(): void {
    if (!this.bets.length) {
      this.snackBar.open('Nessuna scommessa da esportare', 'OK', { duration: 3000 });
      return;
    }
    const header = ['id', 'data', 'evento', 'quota', 'puntata', 'stato', 'profitto'];
    const lines = this.bets.map((bet) =>
      [
        bet.id,
        bet.betDate,
        bet.eventName.replace(/"/g, '""'),
        bet.odds,
        bet.amountStaked,
        bet.status,
        bet.capitalDelta ?? '',
      ]
        .map((v) => `"${v}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'storico-scommesse.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  editBet(bet: Bet): void {
    this.editBetDialog.open(bet).subscribe((saved) => {
      if (saved) {
        this.refresh();
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
          this.refresh();
        },
        error: (err) => {
          this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
        },
      });
    });
  }

  netProfit(): number {
    if (this.capital) {
      return profitFromCapital(this.capital);
    }
    return 0;
  }

  roiPercent(): number {
    if (!this.capital) {
      return 0;
    }
    const start = startingCapitalValue(this.capital);
    if (start <= 0) {
      return 0;
    }
    return (this.netProfit() / start) * 100;
  }

  startingCapitalDisplay(): number {
    if (!this.capital) {
      return 0;
    }
    return startingCapitalValue(this.capital);
  }

  /** Target strike mostrato in UI (benchmark configurabile). */
  strikeTargetPercent(): number {
    return 50;
  }

  strikeRatePercent(): number {
    const s = this.stats;
    if (!s) {
      return 0;
    }
    const settled = s.won + s.lost;
    if (settled <= 0) {
      return 0;
    }
    return (s.won / settled) * 100;
  }

  winVolumePercent(): number {
    const s = this.stats;
    if (!s) {
      return 50;
    }
    const settled = s.won + s.lost;
    if (settled <= 0) {
      return 50;
    }
    return (s.won / settled) * 100;
  }

  closedPercent(): number {
    const s = this.stats;
    if (!s || s.total <= 0) {
      return 0;
    }
    return ((s.won + s.lost) / s.total) * 100;
  }

  betSlipKind(bet: Bet): 'SINGOLA' | 'MULTIPLA' {
    const events = bet.events ?? [];
    if (events.length <= 1) {
      return 'SINGOLA';
    }
    const names = new Set(events.map((e) => e.eventName.trim()));
    return names.size > 1 || events.length > 1 ? 'MULTIPLA' : 'SINGOLA';
  }

  quotaHint(bet: Bet): string {
    return this.betSlipKind(bet) === 'SINGOLA' ? 'Valore Reale' : 'Moltiplicatore';
  }

  stakeBankLabel(bet: Bet): string {
    const pct = Number.parseFloat(bet.stakePercentageApplied);
    if (Number.isFinite(pct)) {
      return `${pct.toFixed(1)}% Bank`;
    }
    return '—';
  }

  winStatusLabel(bet: Bet): string {
    switch (bet.status) {
      case 'WON':
        return 'Accreditato';
      case 'LOST':
        return 'Mancata';
      default:
        return 'In attesa';
    }
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
        return 'history-status-badge--pending';
      case 'WON':
        return 'history-status-badge--won';
      case 'LOST':
        return 'history-status-badge--lost';
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

  betDateLabel(isoDate: string): string {
    const d = new Date(isoDate);
    const months = [
      'GEN',
      'FEB',
      'MAR',
      'APR',
      'MAG',
      'GIU',
      'LUG',
      'AGO',
      'SET',
      'OTT',
      'NOV',
      'DIC',
    ];
    return `${d.getDate()} ${months[d.getMonth()] ?? ''}`;
  }

  formatMoney(value: string | number | null | undefined): string {
    const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    if (!Number.isFinite(n)) {
      return '—';
    }
    return n.toFixed(2);
  }

  profitLabel(bet: Bet): string {
    if (bet.capitalDelta == null) {
      return '—';
    }
    const n = Number.parseFloat(bet.capitalDelta);
    if (!Number.isFinite(n)) {
      return '—';
    }
    const sign = n >= 0 ? '+' : '-';
    return `${sign} € ${Math.abs(n).toFixed(2)}`;
  }
}
