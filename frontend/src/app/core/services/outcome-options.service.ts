import { Injectable, inject } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';
import { OutcomeOption } from '../models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class OutcomeOptionsService {
  private readonly api = inject(ApiService);
  private cache: OutcomeOption[] | null = null;

  load(force = false): Observable<OutcomeOption[]> {
    if (this.cache && !force) {
      return of(this.cache);
    }
    return this.api.getOutcomeOptions().pipe(
      map((items) => this.sortByLabel(items)),
      tap((items) => (this.cache = items)),
    );
  }

  invalidate(): void {
    this.cache = null;
  }

  private sortByLabel(items: OutcomeOption[]): OutcomeOption[] {
    return [...items]
      .map((item) => ({
        ...item,
        kind: item.kind ?? 'standard',
      }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, 'it', { sensitivity: 'base', numeric: true }),
      );
  }
}
