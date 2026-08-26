import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import { Capital, StakingRule, profitFromCapital } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { StakingRuleDialogService } from './staking-rule-dialog.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
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

  rules: StakingRule[] = [];
  capital: Capital | null = null;
  capitalLoading = true;
  capitalSaving = false;

  capitalForm = this.fb.group({
    initialCapital: [0, [Validators.required, Validators.min(0.01)]],
    reset: [false],
  });

  ngOnInit(): void {
    this.loadRules();
    this.loadCapital();
    this.route.fragment.subscribe((fragment) => {
      if (fragment === 'capitale') {
        setTimeout(() => {
          document.getElementById('capitale')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 0);
      }
    });
  }

  get profit(): number {
    if (!this.capital) {
      return 0;
    }
    return profitFromCapital(this.capital);
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
    this.api.getStakingRules().subscribe((rules) => (this.rules = rules));
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
}
