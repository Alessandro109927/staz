import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import {
  buildOutcomeDonutLegend,
  OutcomeDonutLegendItem,
} from '../../utils/outcome-donut.util';

@Component({
  selector: 'app-win-rate-donut',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './win-rate-donut.component.html',
  styleUrl: './win-rate-donut.component.scss',
})
export class WinRateDonutComponent implements OnChanges {
  @Input() won = 0;
  @Input() lost = 0;
  @Input() pending = 0;
  @Input() total = 0;

  legend: OutcomeDonutLegendItem[] = [];

  get settledCount(): number {
    return this.won + this.lost;
  }

  get hasSettled(): boolean {
    return this.settledCount > 0;
  }

  get winRatePercent(): number {
    if (!this.hasSettled) {
      return 0;
    }
    return (this.won / this.settledCount) * 100;
  }

  ngOnChanges(): void {
    const counts = {
      won: this.won,
      lost: this.lost,
      pending: this.pending,
      total: this.total,
    };
    this.legend = [
      ...buildOutcomeDonutLegend(counts),
      {
        label: 'Totali',
        detail: '',
        percent: counts.total > 0 ? `${counts.total}` : '—',
        color: 'rgba(0, 0, 0, 0.52)',
        summary: true,
      },
    ];
  }
}
