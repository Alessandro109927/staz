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
        width: '560px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        autoFocus: 'first-titled-element',
        panelClass: 'new-bet-dialog-panel',
      })
      .afterClosed()
      .pipe(map((result) => !!result));
  }
}
