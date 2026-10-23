import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { OrganizationService } from '../../core/services/organization.service';
import { OrganizationSwitchComponent } from '../../shared/organization-switch/organization-switch.component';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatSnackBarModule,
    OrganizationSwitchComponent,
  ],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.scss',
})
export class SetupComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly organizations = inject(OrganizationService);

  loading = true;
  hasExistingCapital = false;

  form = this.fb.group({
    initialCapital: [500, [Validators.required, Validators.min(0.01)]],
    reset: [false],
  });

  get organizationLabel(): string {
    return this.organizations.label();
  }

  get isBetfair(): boolean {
    return this.organizations.slug() === 'betfair';
  }

  ngOnInit(): void {
    this.api.getCapital().subscribe({
      next: (capital) => {
        if (capital) {
          void this.router.navigate(['/dashboard']);
          return;
        }

        this.hasExistingCapital = false;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  submit(): void {
    if (this.form.invalid) {
      return;
    }

    const { initialCapital, reset } = this.form.getRawValue();
    this.api.setCapital(initialCapital!, reset ?? false).subscribe({
      next: () => {
        this.snackBar.open('Capitale impostato con successo', 'OK', { duration: 3000 });
        void this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        const message = err.error?.message ?? 'Errore durante il salvataggio';
        this.snackBar.open(message, 'Chiudi', { duration: 5000 });
      },
    });
  }
}
