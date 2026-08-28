import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';
import { catchError, of } from 'rxjs';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  templateUrl: './register.component.html',
  styleUrl: './auth.component.scss',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  loading = false;
  errorMessage = '';
  createdUsername = '';

  readonly form = this.fb.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  submit(): void {
    if (this.form.invalid || this.loading) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.createdUsername = '';

    this.auth.register(this.form.getRawValue()).pipe(
      catchError((error) => {
        this.errorMessage =
          error.error?.message ?? 'Registrazione non riuscita. Riprova.';
        return of(null);
      }),
    ).subscribe((response) => {
      this.loading = false;
      if (!response) {
        return;
      }

      this.createdUsername = response.user.username;
      void this.router.navigate(['/setup']);
    });
  }
}
