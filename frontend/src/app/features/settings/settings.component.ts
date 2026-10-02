import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import { Capital, OutcomeOption, StakingRule } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { OutcomeOptionsService } from '../../core/services/outcome-options.service';
import { OutcomeOptionDialogService } from './outcome-option-dialog.service';
import { StakingRuleDialogService } from './staking-rule-dialog.service';
import {
  DEFAULT_TABLE_PAGE_SIZE,
  clampPage,
  paginateSlice,
} from '../../core/utils/pagination.util';
import { VsTablePaginationComponent } from '../../shared/table-pagination/table-pagination.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    VsTablePaginationComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly betChange = inject(BetChangeService);
  private readonly stakingRuleDialog = inject(StakingRuleDialogService);
  private readonly outcomeOptionDialog = inject(OutcomeOptionDialogService);
  private readonly outcomeOptionsService = inject(OutcomeOptionsService);

  rules: StakingRule[] = [];
  outcomeOptions: OutcomeOption[] = [];
  outcomesPage = 1;
  rulesPage = 1;
  outcomesPageSize = DEFAULT_TABLE_PAGE_SIZE;
  rulesPageSize = DEFAULT_TABLE_PAGE_SIZE;
  capital: Capital | null = null;
  capitalLoading = true;
  capitalSaving = false;

  capitalForm = this.fb.group({
    initialCapital: [0, [Validators.required, Validators.min(0.01)]],
    reset: [false],
  });

  ngOnInit(): void {
    this.loadRules();
    this.loadOutcomeOptions();
    this.loadCapital();
    this.betChange.changed.subscribe(() => this.loadCapital());
    this.route.fragment.subscribe((fragment) => {
      if (fragment === 'capitale') {
        setTimeout(() => {
          document.getElementById('capitale')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 0);
      }
    });
  }

  loadCapital(): void {
    this.capitalLoading = true;
    this.api.getCapital().subscribe({
      next: (capital) => {
        this.capital = capital;
        if (capital) {
          this.capitalForm.patchValue({
            initialCapital: Number(capital.initialCapital),
            reset: false,
          });
        }
        this.capitalLoading = false;
      },
      error: () => {
        this.capitalLoading = false;
      },
    });
  }

  saveCapital(): void {
    if (this.capitalForm.invalid) {
      return;
    }

    const { initialCapital, reset } = this.capitalForm.getRawValue();
    this.capitalSaving = true;

    const request$ = reset
      ? this.api.setCapital(initialCapital!, true)
      : this.api.updateInitialCapital(initialCapital!);

    request$.subscribe({
      next: (capital) => {
        this.capital = capital;
        this.capitalForm.patchValue({ reset: false });
        this.snackBar.open('Capitale aggiornato', 'OK', { duration: 3000 });
        this.betChange.notifyChanged();
        this.capitalSaving = false;
      },
      error: (err) => {
        this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
        this.capitalSaving = false;
      },
    });
  }

  loadRules(): void {
    this.api.getStakingRules().subscribe((rules) => {
      this.rules = rules;
      this.rulesPage = clampPage(this.rulesPage, rules.length, this.rulesPageSize);
    });
  }

  loadOutcomeOptions(): void {
    this.outcomeOptionsService.load(true).subscribe((options) => {
      this.outcomeOptions = options;
      this.outcomesPage = clampPage(this.outcomesPage, options.length, this.outcomesPageSize);
    });
  }

  get paginatedOutcomeOptions(): OutcomeOption[] {
    return paginateSlice(this.outcomeOptions, this.outcomesPage, this.outcomesPageSize);
  }

  get paginatedRules(): StakingRule[] {
    return paginateSlice(this.rules, this.rulesPage, this.rulesPageSize);
  }

  onOutcomesPageChange(page: number): void {
    this.outcomesPage = page;
  }

  onRulesPageChange(page: number): void {
    this.rulesPage = page;
  }

  onOutcomesPageSizeChange(pageSize: number): void {
    this.outcomesPageSize = pageSize;
    this.outcomesPage = 1;
    this.outcomesPage = clampPage(
      this.outcomesPage,
      this.outcomeOptions.length,
      this.outcomesPageSize,
    );
  }

  onRulesPageSizeChange(pageSize: number): void {
    this.rulesPageSize = pageSize;
    this.rulesPage = 1;
    this.rulesPage = clampPage(this.rulesPage, this.rules.length, this.rulesPageSize);
  }

  openCreateDialog(): void {
    this.stakingRuleDialog.open().subscribe((saved) => {
      if (saved) {
        this.loadRules();
      }
    });
  }

  openEditDialog(rule: StakingRule): void {
    this.stakingRuleDialog.open(rule).subscribe((saved) => {
      if (saved) {
        this.loadRules();
      }
    });
  }

  deleteRule(rule: StakingRule): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Elimina regola',
        message: `Eliminare la regola ${this.formatRange(rule)}?`,
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }

      this.api.deleteStakingRule(rule.id).subscribe({
        next: () => {
          this.snackBar.open('Regola eliminata', 'OK', { duration: 3000 });
          this.loadRules();
        },
        error: (err) => {
          this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
        },
      });
    });
  }

  formatRange(rule: StakingRule): string {
    if (rule.maxOdds) {
      return `${rule.minOdds} – ${rule.maxOdds}`;
    }
    return `> ${rule.minOdds}`;
  }

  openCreateOutcomeDialog(): void {
    this.outcomeOptionDialog.open().subscribe((saved) => {
      if (saved) {
        this.loadOutcomeOptions();
      }
    });
  }

  openEditOutcomeDialog(option: OutcomeOption): void {
    this.outcomeOptionsService.load(true).subscribe((options) => {
      const fresh = options.find((item) => item.id === option.id) ?? option;
      this.outcomeOptionDialog.open(fresh).subscribe((saved) => {
        if (saved) {
          this.loadOutcomeOptions();
        }
      });
    });
  }

  deleteOutcomeOption(option: OutcomeOption): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Elimina esito',
        message: `Eliminare "${option.label}" dall'elenco?`,
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }

      this.api.deleteOutcomeOption(option.id).subscribe({
        next: () => {
          this.outcomeOptionsService.invalidate();
          this.snackBar.open('Esito eliminato', 'OK', { duration: 3000 });
          this.loadOutcomeOptions();
        },
        error: (err) => {
          this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
        },
      });
    });
  }
}
