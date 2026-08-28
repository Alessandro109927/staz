import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { catchError, map, of, switchMap } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  templateUrl: './login.component.html',
  styleUrl: './auth.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  loading = false;
  errorMessage = '';

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  submit(): void {
    if (this.form.invalid || this.loading) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    const { username, password } = this.form.getRawValue();

    this.auth.login(username, password).pipe(
      switchMap(() => this.api.getCapital()),
      map((capital) => (capital ? '/' : '/setup')),
      catchError((error) => {
        this.errorMessage =
          error.error?.message ?? 'Credenziali non valide. Riprova.';
        return of(null);
      }),
    ).subscribe((target) => {
      this.loading = false;
      if (target) {
        void this.router.navigateByUrl(target);
      }
    });
  }
}
