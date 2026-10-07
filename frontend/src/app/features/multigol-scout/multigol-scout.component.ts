import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EventResultToggleComponent } from '../../shared/components/event-result-toggle/event-result-toggle.component';
import type { EventResultStatus } from '../../core/models';
import { Subscription, interval, of } from 'rxjs';
import { catchError, startWith, switchMap, takeWhile } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import {
  MultigolOpportunity,
  MultigolScoutCompetition,
  MultigolScoutSnapshotResponse,
} from '../../core/models';
import { VsMultiSelectFieldComponent } from '../../shared/vs-multi-select-field/vs-multi-select-field.component';
import {
  VsSelectFieldComponent,
  VsSelectOption,
} from '../../shared/vs-select-field/vs-select-field.component';
import { areaFlagView, type AreaFlagView } from './area-flag.util';
import {
  formatMultigolEmpiricalPercent,
  formatMultigolKickoff,
  formatMultigolMatchdayLabel,
  formatMultigolProbabilityPercent,
} from './multigol-format.util';
import { blendScoutProbabilityHint } from './multigol-blend.util';
import {
  multigolProbabilityBlockToneClass,
  multigolProbabilityToneClass,
  multigolProbabilityToneHint,
} from './multigol-probability-tone.util';
import {
  MultigolScoutListFiltersService,
  type MultigolScoutSortMode,
} from './multigol-scout-list-filters.service';
import {
  calibrationBandSections,
  formatCalibrationPercent,
  type MultigolCalibrationBandSectionView,
} from './multigol-calibration-format.util';
import type { MultigolScoutCalibrationSummary } from '../../core/models';
import {
  MultigolScoutPickResultService,
  type MultigolScoutPickResult,
} from './multigol-scout-pick-result.service';

type MultigolNationOption = {
  key: string;
  areaCode: string | null;
  areaName: string;
};

@Component({
  selector: 'app-multigol-scout',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatIconModule,
    MatTooltipModule,
    VsSelectFieldComponent,
    VsMultiSelectFieldComponent,
    EventResultToggleComponent,
  ],
  templateUrl: './multigol-scout.component.html',
  styleUrl: './multigol-scout.component.scss',
})
export class MultigolScoutComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly listFilters = inject(MultigolScoutListFiltersService);
  readonly pickResults = inject(MultigolScoutPickResultService);
  private readonly destroyRef = inject(DestroyRef);

  loading = true;
  error: string | null = null;
  from = '';
  to = '';
  competitions: MultigolScoutCompetition[] = [];
  /** Tutte le opportunità caricate (senza filtri). */
  allItems: MultigolOpportunity[] = [];
  selectedNationKeys = new Set<string>();
  selectedLeagueKeys = new Set<string>();
  outcomeFilterControl = new FormControl<string[]>([], { nonNullable: true });
  dateFilterControl = new FormControl<string[]>([], { nonNullable: true });
  minSynthesisControl = new FormControl<string>('0', { nonNullable: true });
  leagueSearchControl = new FormControl('', { nonNullable: true });
  readonly outcomeFilterOptions: VsSelectOption[] = [
    { value: 'Multigol Casa 1-6', label: 'Multigol Casa 1–6' },
    { value: 'Multigol Ospite 1-6', label: 'Multigol Ospite 1–6' },
  ];
  readonly minSynthesisOptions: VsSelectOption[] = [
    { value: '0', label: 'Tutte' },
    { value: '50', label: 'Sintesi ≥ 50%' },
    { value: '58', label: 'Sintesi ≥ 58%' },
    { value: '68', label: 'Sintesi ≥ 68%' },
    { value: '78', label: 'Sintesi ≥ 78%' },
  ];
  sortControl = new FormControl<MultigolScoutSortMode>('date', { nonNullable: true });
  readonly sortOptions: VsSelectOption[] = [
    { value: 'date', label: 'Data partita' },
    { value: 'probability', label: 'Probabilità' },
  ];
  progressLabel = '';
  loadedLeagues = 0;
  totalLeagues = 0;
  /** Leghe saltate (timeout / errore) nell’ultima scansione. */
  skippedLeagues = 0;
  snapshotBuiltAt: string | null = null;
  /** Scansione server in corso (banner), senza bloccare tutta la pagina. */
  serverScanInProgress = false;
  calibration: MultigolScoutCalibrationSummary | null = null;
  private pollSub?: Subscription;
  private pollStartedAt = 0;
  private static readonly POLL_MS = 5000;
  private static readonly POLL_MAX_MS = 45 * 60 * 1000;

  ngOnInit(): void {
    this.restoreListFilters();
    this.bindListFilterPersistence();
    this.loadSnapshot();
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  get nationOptions(): MultigolNationOption[] {
    const map = new Map<string, MultigolNationOption>();
    const add = (
      areaCode: string | null | undefined,
      areaName: string | null | undefined,
    ) => {
      if (!areaName?.trim()) {
        return;
      }
      const name = areaName.trim();
      const key = this.nationKey(areaCode, name);
      if (!map.has(key)) {
        map.set(key, {
          key,
          areaCode: areaCode?.trim().toUpperCase() ?? null,
          areaName: name,
        });
      }
    };
    for (const c of this.competitions) {
      add(c.areaCode, c.areaName);
    }
    for (const item of this.allItems) {
      add(item.areaCode, item.areaName);
    }
    return [...map.values()].sort((a, b) =>
      a.areaName.localeCompare(b.areaName, 'it'),
    );
  }

  get leagueOptions(): MultigolScoutCompetition[] {
    const q = this.leagueSearchControl.value.trim().toLowerCase();
    let list = [...this.competitions];
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.areaName?.toLowerCase().includes(q) ?? false) ||
          (c.code?.toLowerCase().includes(q) ?? false) ||
          String(c.id).includes(q),
      );
    }
    return list.sort((a, b) => {
      const area = (a.areaName ?? '').localeCompare(b.areaName ?? '', 'it');
      if (area !== 0) {
        return area;
      }
      return a.name.localeCompare(b.name, 'it');
    });
  }

  get dateFilterOptions(): VsSelectOption[] {
    const keys = new Set<string>();
    for (const item of this.allItems) {
      keys.add(this.itemDateKey(item.utcDate));
    }
    return [...keys]
      .sort()
      .map((key) => ({ value: key, label: this.itemDateLabel(key) }));
  }

  get hasActiveFilters(): boolean {
    return (
      this.selectedNationKeys.size > 0 ||
      this.selectedLeagueKeys.size > 0 ||
      this.outcomeFilterControl.value.length > 0 ||
      this.dateFilterControl.value.length > 0 ||
      this.minSynthesisControl.value !== '0'
    );
  }

  get displayItems(): MultigolOpportunity[] {
    let list = this.allItems;
    if (this.selectedNationKeys.size > 0) {
      list = list.filter((item) => {
        const key = this.itemNationKey(item);
        return key != null && this.selectedNationKeys.has(key);
      });
    }
    if (this.selectedLeagueKeys.size > 0) {
      list = list.filter((item) => this.selectedLeagueKeys.has(this.itemLeagueKey(item)));
    }
    const outcomes = this.outcomeFilterControl.value;
    if (outcomes.length > 0) {
      const allow = new Set(outcomes);
      list = list.filter((item) => allow.has(item.outcomeLabel));
    }
    const dates = this.dateFilterControl.value;
    if (dates.length > 0) {
      const allowDates = new Set(dates);
      list = list.filter((item) => allowDates.has(this.itemDateKey(item.utcDate)));
    }
    const minSynth = Number(this.minSynthesisControl.value);
    if (minSynth > 0) {
      list = list.filter((item) => this.synthesisPercent(item) >= minSynth);
    }
    const mode = this.sortControl.value;
    const sorted = [...list];
    if (mode === 'probability') {
      sorted.sort(
        (a, b) => this.synthesisPercent(b) - this.synthesisPercent(a),
      );
    } else {
      sorted.sort(
        (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
      );
    }
    return sorted;
  }

  reload(): void {
    this.error = null;
    this.progressLabel = 'Scansione completa in corso sul server…';
    this.serverScanInProgress = true;
    this.api.refreshMultigolSnapshot({ mode: 'full', async: true }).subscribe({
      next: () => this.pollUntilScanDone(),
      error: (err) => {
        this.serverScanInProgress = false;
        this.progressLabel = '';
        this.error =
          err.error?.message ?? 'Impossibile avviare l’aggiornamento.';
      },
    });
  }

  nationFlag(areaCode: string | null, areaName: string): AreaFlagView | null {
    return areaFlagView(areaCode, areaName);
  }

  formatKickoff(utcDate: string): string {
    return formatMultigolKickoff(utcDate);
  }

  formatMatchday(item: MultigolOpportunity): string | null {
    return formatMultigolMatchdayLabel(item.matchday, item.roundLabel);
  }

  formatPoissonPercent(value: number): string {
    return formatMultigolProbabilityPercent(value);
  }

  probToneClass(percent: number | null | undefined): string {
    return multigolProbabilityToneClass(percent);
  }

  probBlockToneClass(percent: number | null | undefined): string {
    return multigolProbabilityBlockToneClass(percent);
  }

  probToneHint(percent: number | null | undefined): string {
    return multigolProbabilityToneHint(percent);
  }

  synthesisPercent(item: MultigolOpportunity): number {
    if (item.synthesisPercent != null && Number.isFinite(item.synthesisPercent)) {
      return item.synthesisPercent;
    }
    return item.probabilityPercent;
  }

  synthesisHint(item: MultigolOpportunity): string {
    return blendScoutProbabilityHint(
      item.empiricalSampleMatches ?? 0,
      item.xgSampleMatches ?? 0,
      item.xgLambdaSide ?? null,
    );
  }

  formatEmpiricalPercent(item: MultigolOpportunity): string | null {
    return formatMultigolEmpiricalPercent({
      empiricalProbabilityPercent: item.empiricalProbabilityPercent,
      empiricalSampleHits: item.empiricalSampleHits ?? 0,
      empiricalSampleMatches: item.empiricalSampleMatches ?? 0,
    });
  }

  isNationActive(key: string): boolean {
    return this.selectedNationKeys.has(key);
  }

  toggleNation(key: string): void {
    if (this.selectedNationKeys.has(key)) {
      this.selectedNationKeys.delete(key);
    } else {
      this.selectedNationKeys.add(key);
    }
    this.selectedNationKeys = new Set(this.selectedNationKeys);
    this.persistChipFilters();
  }

  clearNations(): void {
    this.selectedNationKeys = new Set();
    this.persistChipFilters();
  }

  isLeagueActive(key: string): boolean {
    return this.selectedLeagueKeys.has(key);
  }

  toggleLeague(key: string): void {
    if (this.selectedLeagueKeys.has(key)) {
      this.selectedLeagueKeys.delete(key);
    } else {
      this.selectedLeagueKeys.add(key);
    }
    this.selectedLeagueKeys = new Set(this.selectedLeagueKeys);
    this.persistChipFilters();
  }

  clearLeagues(): void {
    this.selectedLeagueKeys = new Set();
    this.persistChipFilters();
  }

  pickResultRevision(): number {
    return this.pickResults.revision();
  }

  get calibrationSections(): MultigolCalibrationBandSectionView[] {
    const cal = this.pickResults.calibration() ?? this.calibration;
    return calibrationBandSections(cal?.bands);
  }

  formatCalibrationPercent(value: number | null): string {
    return formatCalibrationPercent(value);
  }

  pickResultFor(matchId: number): EventResultStatus {
    return this.pickResults.get(matchId);
  }

  togglePickResult(matchId: number, target: MultigolScoutPickResult): void {
    this.pickResults.toggle(matchId, target);
  }

  competitionLabel(c: MultigolScoutCompetition): string {
    const area = c.areaName ? `${c.areaName} · ` : '';
    const code = c.code ? ` (${c.code})` : ` (id ${c.id})`;
    return `${area}${c.name}${code}`;
  }

  private nationKey(
    areaCode: string | null | undefined,
    areaName: string,
  ): string {
    const code = areaCode?.trim().toUpperCase();
    if (code) {
      return code;
    }
    return `n:${areaName.trim().toLowerCase()}`;
  }

  private itemLeagueKey(item: MultigolOpportunity): string {
    const code = item.leagueCode;
    const byKey = this.competitions.find((c) => c.key === code);
    if (byKey) {
      return byKey.key;
    }
    const byLegacy = this.competitions.find((c) => c.code === code);
    if (byLegacy) {
      return byLegacy.key;
    }
    const byId = this.competitions.find((c) => String(c.id) === code);
    return byId?.key ?? code;
  }

  private itemDateKey(utcDate: string): string {
    const d = new Date(utcDate);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private itemDateLabel(key: string): string {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('it-IT', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  private itemNationKey(item: MultigolOpportunity): string | null {
    if (!item.areaName?.trim() && !item.areaCode?.trim()) {
      return null;
    }
    const name = item.areaName?.trim() || item.areaCode?.trim() || '';
    return this.nationKey(item.areaCode, name);
  }

  leagueLabel(key: string): string {
    return this.competitions.find((c) => c.key === key)?.name ?? key;
  }

  private setDefaultRange(): void {
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 86400000);
    this.from = start.toISOString().slice(0, 10);
    this.to = end.toISOString().slice(0, 10);
  }

  private restoreListFilters(): void {
    const saved = this.listFilters.read();
    this.selectedNationKeys = new Set(saved.nationKeys);
    this.selectedLeagueKeys = new Set(saved.leagueKeys);
    this.outcomeFilterControl.setValue(saved.outcomes, { emitEvent: false });
    this.dateFilterControl.setValue(saved.dates, { emitEvent: false });
    this.minSynthesisControl.setValue(saved.minSynthesis, { emitEvent: false });
    this.sortControl.setValue(saved.sort, { emitEvent: false });
    this.leagueSearchControl.setValue(saved.leagueSearch, { emitEvent: false });
  }

  private bindListFilterPersistence(): void {
    const persistToolbar = (): void => {
      this.listFilters.save({
        outcomes: this.outcomeFilterControl.value,
        dates: this.dateFilterControl.value,
        minSynthesis: this.minSynthesisControl.value,
        sort: this.sortControl.value,
        leagueSearch: this.leagueSearchControl.value,
      });
    };
    this.outcomeFilterControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => persistToolbar());
    this.dateFilterControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => persistToolbar());
    this.minSynthesisControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => persistToolbar());
    this.sortControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => persistToolbar());
    this.leagueSearchControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => persistToolbar());
  }

  private persistChipFilters(): void {
    this.listFilters.save({
      nationKeys: [...this.selectedNationKeys],
      leagueKeys: [...this.selectedLeagueKeys],
    });
  }

  private loadSnapshot(): void {
    this.loading = true;
    this.error = null;
    this.api.getMultigolSnapshot().subscribe({
      next: (snap) => {
        this.applySnapshot(snap);
        this.serverScanInProgress = snap.meta.scanInProgress;
        this.loading = false;
        if (snap.meta.scanInProgress) {
          this.pollUntilScanDone();
        }
      },
      error: (err) => {
        this.error =
          err.error?.message ?? 'Impossibile caricare lo snapshot Scout.';
        this.loading = false;
      },
    });
  }

  private applySnapshot(snap: MultigolScoutSnapshotResponse): void {
    this.from = snap.from;
    this.to = snap.to;
    this.allItems = snap.items;
    this.competitions = snap.competitions;
    this.totalLeagues = snap.competitions.length;
    this.snapshotBuiltAt = snap.meta.builtAt;
    this.loadedLeagues = snap.competitions.length;
    if (snap.pickResults && snap.calibration) {
      this.calibration = snap.calibration;
      this.pickResults.hydrate(snap.pickResults, snap.calibration);
    }
  }

  private pollUntilScanDone(): void {
    this.pollSub?.unsubscribe();
    if (!this.pollStartedAt) {
      this.pollStartedAt = Date.now();
    }
    this.serverScanInProgress = true;
    if (!this.progressLabel) {
      this.progressLabel =
        'Scansione in corso sul server (nessuna chiamata API dal browser)…';
    }
    this.pollSub = interval(MultigolScoutComponent.POLL_MS)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.api.getMultigolSnapshot().pipe(
            catchError(() => of(null)),
          ),
        ),
        takeWhile(
          (snap) => snap != null && snap.meta.scanInProgress,
          true,
        ),
      )
      .subscribe({
        next: (snap) => {
          if (!snap) {
            return;
          }
          this.applySnapshot(snap);
          this.serverScanInProgress = snap.meta.scanInProgress;
          if (!snap.meta.scanInProgress) {
            this.progressLabel = '';
            this.pollStartedAt = 0;
            this.pollSub?.unsubscribe();
            return;
          }
          if (
            Date.now() - this.pollStartedAt >
            MultigolScoutComponent.POLL_MAX_MS
          ) {
            this.serverScanInProgress = false;
            this.progressLabel = '';
            this.pollStartedAt = 0;
            this.pollSub?.unsubscribe();
            this.error =
              'Scansione troppo lunga o interrotta. Clicca Aggiorna per riprovare.';
          }
        },
      });
  }

  onCrestError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (img) {
      img.hidden = true;
    }
  }
}
