import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StakingRule } from '../../core/models';
import { StakingRuleDialogComponent } from './staking-rule-dialog.component';

@Injectable({ providedIn: 'root' })
export class StakingRuleDialogService {
  private readonly dialog = inject(MatDialog);

  open(rule?: StakingRule): Observable<boolean> {
    return this.dialog
      .open(StakingRuleDialogComponent, {
        width: '480px',
        maxWidth: '95vw',
        autoFocus: 'first-titled-element',
        panelClass: 'new-bet-dialog-panel',
        data: { rule: rule ?? null },
      })
      .afterClosed()
      .pipe(map((result) => !!result));
  }
}
