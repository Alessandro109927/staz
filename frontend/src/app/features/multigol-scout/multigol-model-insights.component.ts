import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { MultigolAnalysis } from '../../core/models';

/** Dati extra del modello Multigol (scomposizione sintesi, quote, segnatura, riposo, assenze). */
@Component({
  selector: 'app-multigol-model-insights',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './multigol-model-insights.component.html',
  styleUrl: './multigol-model-insights.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultigolModelInsightsComponent {
  @Input({ required: true }) data!: MultigolAnalysis;
}
