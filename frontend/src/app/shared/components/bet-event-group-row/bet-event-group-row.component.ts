import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BetEvent } from '../../../core/models';
import { MatchTeamsDisplayComponent } from '../../match-teams-display/match-teams-display.component';
import { BetEventResultRowComponent } from '../bet-event-result-row/bet-event-result-row.component';

@Component({
  selector: 'app-bet-event-group-row',
  standalone: true,
  imports: [CommonModule, MatchTeamsDisplayComponent, BetEventResultRowComponent],
  templateUrl: './bet-event-group-row.component.html',
  styleUrl: './bet-event-group-row.component.scss',
})
export class BetEventGroupRowComponent {
  @Input({ required: true }) betId!: number;
  @Input({ required: true }) eventName!: string;
  @Input({ required: true }) picks!: BetEvent[];
  @Input() variant: 'default' | 'slip' | 'history' = 'default';

  @Output() resultChanged = new EventEmitter<void>();
}
