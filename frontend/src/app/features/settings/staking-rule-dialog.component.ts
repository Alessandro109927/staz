import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { StakingRule } from '../../core/models';

@Component({
  selector: 'app-staking-rule-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  templateUrl: './staking-rule-dialog.component.html',
  styleUrl: './staking-rule-dialog.component.scss',
})
export class StakingRuleDialogComponent {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<StakingRuleDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly data = inject<{ rule: StakingRule | null }>(MAT_DIALOG_DATA);

  readonly rule = this.data.rule;

  form = this.fb.group({
    minOdds: [1, [Validators.required, Validators.min(1)]],
    maxOdds: [null as number | null],
    stakePercentage: [10, [Validators.required, Validators.min(0.01)]],
  });

  constructor() {
    if (this.rule) {
      this.form.patchValue({
        minOdds: Number(this.rule.minOdds),
        maxOdds: this.rule.maxOdds ? Number(this.rule.maxOdds) : null,
        stakePercentage: Number(this.rule.stakePercentage),
      });
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  submit(): void {
    if (this.form.invalid) {
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      minOdds: value.minOdds!,
      maxOdds: value.maxOdds,
      stakePercentage: value.stakePercentage!,
    };

    const request$ = this.rule
      ? this.api.updateStakingRule(this.rule.id, payload)
      : this.api.createStakingRule(payload);

    request$.subscribe({
      next: () => {
        this.snackBar.open(
          this.rule ? 'Regola aggiornata' : 'Regola creata',
          'OK',
          { duration: 3000 },
        );
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
      },
    });
  }
}
