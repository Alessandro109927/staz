import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { NewBetComponent } from './new-bet.component';

@Injectable({ providedIn: 'root' })
export class NewBetDialogService {
  private readonly dialog = inject(MatDialog);

  open(): Observable<boolean> {
    return this.dialog
      .open(NewBetComponent, {
        width: '980px',
        maxWidth: '98vw',
        maxHeight: '100dvh',
        autoFocus: 'first-titled-element',
        panelClass: ['new-bet-dialog-panel', 'bet-form-dialog-panel'],
      })
      .afterClosed()
      .pipe(map((result) => !!result));
  }
}
