import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Bet } from '../../core/models';
import { EditBetComponent } from './edit-bet.component';

@Injectable({ providedIn: 'root' })
export class EditBetDialogService {
  private readonly dialog = inject(MatDialog);

  open(bet: Bet): Observable<boolean> {
    return this.dialog
      .open(EditBetComponent, {
        width: '980px',
        maxWidth: '98vw',
        maxHeight: '100dvh',
        autoFocus: 'first-titled-element',
        panelClass: ['new-bet-dialog-panel', 'bet-form-dialog-panel'],
        data: { bet },
      })
      .afterClosed()
      .pipe(map((result) => !!result));
  }
}
