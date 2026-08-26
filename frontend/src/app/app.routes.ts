import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ApiService } from './core/services/api.service';
import { ShellComponent } from './layout/shell/shell.component';

export const routes: Routes = [
  {
    path: 'setup',
    loadComponent: () =>
      import('./features/setup/setup.component').then((m) => m.SetupComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [
      () => {
        const api = inject(ApiService);
        return api.getCapital().pipe(
          map((capital) => (capital ? true : '/setup')),
          catchError(() => of(true)),
        );
      },
    ],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./features/history/history.component').then((m) => m.HistoryComponent),
      },
      {
        path: 'monthly-report',
        loadComponent: () =>
          import('./features/monthly-report/monthly-report.component').then(
            (m) => m.MonthlyReportComponent,
          ),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
