import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BetChangeService {
  private readonly changed$ = new Subject<void>();

  readonly changed = this.changed$.asObservable();

  notifyCreated(): void {
    this.changed$.next();
  }

  notifyChanged(): void {
    this.changed$.next();
  }
}
