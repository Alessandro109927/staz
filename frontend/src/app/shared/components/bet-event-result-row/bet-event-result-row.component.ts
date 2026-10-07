import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BetEvent, EventResultStatus } from '../../../core/models';
import { ApiService } from '../../../core/services/api.service';
import { EventResultToggleComponent } from '../event-result-toggle/event-result-toggle.component';

@Component({
  selector: 'app-bet-event-result-row',
  standalone: true,
  imports: [CommonModule, MatSnackBarModule, EventResultToggleComponent],
  templateUrl: './bet-event-result-row.component.html',
  styleUrl: './bet-event-result-row.component.scss',
})
export class BetEventResultRowComponent {
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);

  @Input({ required: true }) betId!: number;
  @Input({ required: true }) event!: BetEvent;
  @Input() showEventName = true;
  /** default | slip-pick (riga esito sotto le squadre, toggle a sinistra). */
  @Input() layout: 'default' | 'slip-pick' = 'default';

  @Output() resultChanged = new EventEmitter<void>();

  saving = false;

  toggleResult(target: 'WON' | 'LOST'): void {
    if (this.saving) {
      return;
    }

    const next: EventResultStatus =
      this.event.resultStatus === target ? null : target;

    this.saving = true;
    this.api.updateEventResult(this.betId, this.event.id, next).subscribe({
      next: () => {
        this.event.resultStatus = next;
        this.saving = false;
        this.resultChanged.emit();
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving = false;
        this.snackBar.open(err.error?.message ?? 'Errore', 'Chiudi', { duration: 5000 });
      },
    });
  }
}
