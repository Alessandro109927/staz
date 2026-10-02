import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PageLoadingService {
  private readonly pending = signal(0);

  readonly active = computed(() => this.pending() > 0);

  begin(): void {
    this.pending.update((count) => count + 1);
  }

  end(): void {
    this.pending.update((count) => Math.max(0, count - 1));
  }
}
