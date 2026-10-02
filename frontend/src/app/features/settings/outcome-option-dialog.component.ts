import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { OutcomeOptionsService } from '../../core/services/outcome-options.service';
import { OutcomeOption } from '../../core/models';

@Component({
  selector: 'app-outcome-option-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSnackBarModule,
  ],
  templateUrl: './outcome-option-dialog.component.html',
  styleUrl: './outcome-option-dialog.component.scss',
})
export class OutcomeOptionDialogComponent {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<OutcomeOptionDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly outcomeOptions = inject(OutcomeOptionsService);
  private readonly data = inject<{ option: OutcomeOption | null }>(MAT_DIALOG_DATA);

  readonly option = this.data.option;

  form = this.fb.group({
    label: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(255)]],
    isScorer: [false],
  });

  constructor() {
    if (this.option) {
      this.form.patchValue({
        label: this.option.label,
        description: this.option.description ?? '',
        isScorer: (this.option.kind ?? 'standard') === 'scorer',
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

    const { label, description, isScorer } = this.form.getRawValue();
    const payload = {
      label: label!.trim(),
      description: description?.trim() ? description.trim() : null,
      kind: isScorer ? ('scorer' as const) : ('standard' as const),
    };
    const request$ = this.option
      ? this.api.updateOutcomeOption(this.option.id, payload)
      : this.api.createOutcomeOption(payload);

    request$.subscribe({
      next: () => {
        this.outcomeOptions.invalidate();
        this.snackBar.open(
          this.option ? 'Esito aggiornato' : 'Esito aggiunto',
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
