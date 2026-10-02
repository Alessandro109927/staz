import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { OutcomeOption } from '../../core/models';
import { OutcomeOptionDialogComponent } from './outcome-option-dialog.component';

@Injectable({ providedIn: 'root' })
export class OutcomeOptionDialogService {
  private readonly dialog = inject(MatDialog);

  open(option?: OutcomeOption): Observable<boolean> {
    return this.dialog
      .open(OutcomeOptionDialogComponent, {
        width: '480px',
        maxWidth: '95vw',
        autoFocus: 'first-titled-element',
        panelClass: 'new-bet-dialog-panel',
        data: { option: option ?? null },
      })
      .afterClosed()
      .pipe(map((result) => !!result));
  }
}
