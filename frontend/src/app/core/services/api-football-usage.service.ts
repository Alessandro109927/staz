import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { ApiFootballUsage } from '../models';

@Injectable({ providedIn: 'root' })
export class ApiFootballUsageService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  readonly usage = signal<ApiFootballUsage | null>(null);

  refresh(): void {
    this.http
      .get<ApiFootballUsage>(`${this.baseUrl}/multigol-scout/api-football/usage`)
      .subscribe({
        next: (u) => this.usage.set(u),
        error: () => this.usage.set(null),
      });
  }
}
