import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import type {
  MultigolScoutCalibrationSummary,
  MultigolScoutPickResultValue,
} from '../../core/models';

export type MultigolScoutPickResult = MultigolScoutPickResultValue;

const STORAGE_KEY = 'staz.multigol-scout.pick-results';
const MIGRATED_KEY = 'staz.multigol-scout.pick-results.migrated';

@Injectable({ providedIn: 'root' })
export class MultigolScoutPickResultService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  private readonly results = signal<Record<number, MultigolScoutPickResult | undefined>>({});
  readonly calibration = signal<MultigolScoutCalibrationSummary | null>(null);
  readonly revision = signal(0);

  get(matchId: number): MultigolScoutPickResult | null {
    return this.results()[matchId] ?? null;
  }

  hydrate(
    pickResults: Record<number, MultigolScoutPickResultValue>,
    calibration: MultigolScoutCalibrationSummary,
  ): void {
    this.results.set({ ...pickResults });
    this.calibration.set(calibration);
    this.revision.update((n) => n + 1);
    void this.migrateLocalIfNeeded(pickResults);
  }

  applyServerUpdate(
    pickResults: Record<number, MultigolScoutPickResultValue>,
    calibration: MultigolScoutCalibrationSummary,
  ): void {
    this.results.set({ ...pickResults });
    this.calibration.set(calibration);
    this.revision.update((n) => n + 1);
  }

  toggle(matchId: number, target: MultigolScoutPickResult): void {
    const before = { ...this.results() };
    const current = before[matchId] ?? null;
    const next = current === target ? null : target;
    const snapshot = { ...before };
    if (next == null) {
      delete snapshot[matchId];
    } else {
      snapshot[matchId] = next;
    }
    this.results.set(snapshot);
    this.revision.update((n) => n + 1);

    this.http
      .put<{
        pickResults: Record<number, MultigolScoutPickResultValue>;
        calibration: MultigolScoutCalibrationSummary;
      }>(`${this.baseUrl}/multigol-scout/pick-results/${matchId}`, { result: next })
      .subscribe({
        next: (res) => this.applyServerUpdate(res.pickResults, res.calibration),
        error: () => {
          this.results.set(before);
          this.revision.update((n) => n + 1);
        },
      });
  }

  private async migrateLocalIfNeeded(
    serverMap: Record<number, MultigolScoutPickResultValue>,
  ): Promise<void> {
    if (typeof localStorage === 'undefined') {
      return;
    }
    if (localStorage.getItem(MIGRATED_KEY) === '1') {
      return;
    }
    const local = this.readLocalStorage();
    const items = Object.entries(local)
      .map(([id, result]) => ({ matchId: Number(id), result }))
      .filter(
        (row) =>
          Number.isFinite(row.matchId) &&
          (row.result === 'WON' || row.result === 'LOST') &&
          serverMap[row.matchId] == null,
      );
    if (!items.length) {
      localStorage.setItem(MIGRATED_KEY, '1');
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    this.http
      .post<{
        pickResults: Record<number, MultigolScoutPickResultValue>;
        calibration: MultigolScoutCalibrationSummary;
      }>(`${this.baseUrl}/multigol-scout/pick-results/import`, { items })
      .subscribe({
        next: (res) => {
          this.applyServerUpdate(res.pickResults, res.calibration);
          localStorage.setItem(MIGRATED_KEY, '1');
          localStorage.removeItem(STORAGE_KEY);
        },
      });
  }

  private readLocalStorage(): Record<number, MultigolScoutPickResult> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as Record<string, MultigolScoutPickResult>;
      const out: Record<number, MultigolScoutPickResult> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const id = Number(key);
        if (Number.isFinite(id) && (value === 'WON' || value === 'LOST')) {
          out[id] = value;
        }
      }
      return out;
    } catch {
      return {};
    }
  }
}
