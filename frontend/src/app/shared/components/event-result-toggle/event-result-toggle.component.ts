import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { EventResultStatus } from '../../../core/models';

@Component({
  selector: 'app-event-result-toggle',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './event-result-toggle.component.html',
  styleUrl: './event-result-toggle.component.scss',
})
export class EventResultToggleComponent {
  @Input() resultStatus: EventResultStatus = null;
  @Input() disabled = false;

  @Output() resultToggle = new EventEmitter<'WON' | 'LOST'>();

  onToggle(target: 'WON' | 'LOST', event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.disabled) {
      return;
    }
    this.resultToggle.emit(target);
  }
}
