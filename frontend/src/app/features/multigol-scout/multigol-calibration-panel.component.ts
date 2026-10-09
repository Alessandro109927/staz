import { animate, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { MultigolScoutCalibrationSummary } from '../../core/models';
import {
  calibrationBandConcludedCount,
  calibrationBandHeadline,
  calibrationBandSections,
  calibrationDeltaPercent,
  calibrationMetricIcon,
  calibrationMetricTitle,
  formatCalibrationDelta,
  formatCalibrationPercent,
  type MultigolCalibrationBandSectionView,
  type MultigolCalibrationRowView,
} from './multigol-calibration-format.util';

@Component({
  selector: 'app-multigol-calibration-panel',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './multigol-calibration-panel.component.html',
  styleUrl: './multigol-calibration-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('calibrationReveal', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('160ms ease-out', style({ opacity: 1 })),
      ]),
      transition(':leave', [animate('120ms ease-in', style({ opacity: 0 }))]),
    ]),
  ],
})
export class MultigolCalibrationPanelComponent {
  readonly calibration = input.required<MultigolScoutCalibrationSummary>();

  readonly sections = computed(() => calibrationBandSections(this.calibration().bands));

  private readonly openBandIds = signal<ReadonlySet<string>>(new Set(['90-100']));

  readonly anyBandOpen = computed(() => this.openBandIds().size > 0);

  isBandOpen(bandId: string): boolean {
    return this.openBandIds().has(bandId);
  }

  toggleBand(bandId: string): void {
    this.openBandIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(bandId)) {
        next.delete(bandId);
      } else {
        next.add(bandId);
      }
      return next;
    });
  }

  bandHeadline(section: MultigolCalibrationBandSectionView): string {
    return calibrationBandHeadline(section);
  }

  bandConcludedCount(section: MultigolCalibrationBandSectionView): number {
    return calibrationBandConcludedCount(section);
  }

  metricTitle(label: string): string {
    return calibrationMetricTitle(label);
  }

  metricIcon(label: string): string {
    return calibrationMetricIcon(label);
  }

  formatPercent(value: number | null): string {
    return formatCalibrationPercent(value);
  }

  formatDelta(value: number | null): string {
    return formatCalibrationDelta(value);
  }

  delta(row: MultigolCalibrationRowView): number | null {
    return calibrationDeltaPercent(row.observedPercent, row.expectedPercent);
  }
}
