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
import {
  VsSelectFieldComponent,
  VsSelectOption,
} from '../../shared/vs-select-field/vs-select-field.component';
import { areaFlagView, type AreaFlagView } from './area-flag.util';
import {
  formatMultigolEmpiricalPercent,
  formatMultigolCardKickoff,
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

import { MultigolCalibrationPanelComponent } from './multigol-calibration-panel.component';
import {
  calibrationForItems,
  CURRENT_MODEL_VERSION,
} from './multigol-calibration-filter.util';
import type { MultigolScoutCalibrationSummary } from '../../core/models';
import {
  MultigolScoutPickResultService,
  type MultigolScoutPickResult,
} from './multigol-scout-pick-result.service';

const MIN_LIST_SYNTHESIS = 87;

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
    EventResultToggleComponent,
    MultigolCalibrationPanelComponent,
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
  nationFilterControl = new FormControl<string>('', { nonNullable: true });
  dateFilterControl = new FormControl<string>('', { nonNullable: true });
  sortControl = new FormControl<MultigolScoutSortMode>('probability', { nonNullable: true });
  readonly sortOptions: VsSelectOption[] = [
    { value: 'probability', label: 'Probabilità sintesi' },
    { value: 'date', label: 'Data partita' },
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
  private filteredCalibrationCache: {
    key: string;
    base: MultigolScoutCalibrationSummary;
    items: MultigolOpportunity[];
    value: MultigolScoutCalibrationSummary;
  } | null = null;
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
    for (const item of this.relevantItems) {
      add(item.areaCode, item.areaName);
    }
    return [...map.values()].sort((a, b) =>
      a.areaName.localeCompare(b.areaName, 'it'),
    );
  }

  get nationFilterOptions(): VsSelectOption[] {
    const options: VsSelectOption[] = [
      { value: '', label: 'Tutte le nazioni', count: this.relevantItems.length },
    ];
    for (const nation of this.nationOptions) {
      const flag = this.nationFlag(nation.areaCode, nation.areaName);
      options.push({
        value: nation.key,
        label: nation.areaName,
        count: this.nationMatchCount(nation.key),
        flag: flag ?? undefined,
      });
    }
    return options;
  }

  get dateFilterMin(): string {
    return this.dateFilterBounds().min;
  }

  get dateFilterMax(): string {
    return this.dateFilterBounds().max;
  }

  get hasActiveFilters(): boolean {
    return this.nationFilterControl.value !== '' || this.dateFilterControl.value !== '';
  }

  get displayItems(): MultigolOpportunity[] {
    const list = this.filteredItems();
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

  /** Solo sintesi ≥ 87% calcolata col modello attuale. Le pick precedenti non si mostrano. */
  get relevantItems(): MultigolOpportunity[] {
    return this.allItems.filter(
      (item) =>
        (item.modelVersion ?? 1) >= CURRENT_MODEL_VERSION &&
        this.synthesisPercent(item) >= MIN_LIST_SYNTHESIS,
    );
  }

  private filteredItems(): MultigolOpportunity[] {
    let list = this.relevantItems;
    const nation = this.nationFilterControl.value;
    if (nation) {
      list = list.filter((item) => this.itemNationKey(item) === nation);
    }
    const date = this.dateFilterControl.value;
    if (date) {
      list = list.filter((item) => this.itemDateKey(item.utcDate) === date);
    }
    return list;
  }

  reload(): void {
    this.error = null;
    const leagues =
      this.selectedLeagueKeys.size > 0 ? [...this.selectedLeagueKeys] : undefined;
    this.progressLabel = leagues?.length
      ? `Aggiornamento ${leagues.length} leghe selezionate…`
      : 'Aggiornamento incrementale (nuovi giorni)…';
    this.serverScanInProgress = true;
    this.api
      .refreshMultigolSnapshot({
        leagues,
        mode: leagues?.length ? undefined : 'incremental',
        async: true,
      })
      .subscribe({
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

  formatCardKickoff(utcDate: string): string {
    return formatMultigolCardKickoff(utcDate);
  }

  leagueBadgeInitials(item: MultigolOpportunity): string {
    const name = item.leagueName?.trim() ?? '';
    if (!name) {
      return '—';
    }
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
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
    if ((item.modelVersion ?? 1) >= 2) {
      const extras = [
        item.marketPercent != null ? `quota mercato ${item.marketPercent.toFixed(1)}%` : null,
        item.scoringRatePercent != null
          ? `tasso di segnatura ${item.scoringRatePercent.toFixed(1)}%`
          : null,
      ].filter(Boolean);
      return (
        `Sintesi modello v${item.modelVersion}: Poisson su λ fuso (classifica, forma recente, forza vs lega, xG) ` +
        `+ segnatura reale + empirica ridotta + mercato.` +
        (extras.length ? ` Qui: ${extras.join(', ')}.` : '') +
        ' Apri il dettaglio per la scomposizione.'
      );
    }
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

  selectAllMonitored(): void {
    this.selectedNationKeys = new Set(this.nationOptions.map((n) => n.key));
    this.selectedLeagueKeys = new Set();
    this.persistChipFilters();
  }

  clearMonitoredNationsAndLeagues(): void {
    this.selectedNationKeys = new Set();
    this.selectedLeagueKeys = new Set();
    this.persistChipFilters();
  }

  isMonitoredTuttiActive(): boolean {
    return this.selectedNationKeys.size === 0 && this.selectedLeagueKeys.size === 0;
  }

  nationMatchCount(nationKey: string): number {
    return this.relevantItems.filter((item) => this.itemNationKey(item) === nationKey).length;
  }

  resetMonitoredFilters(): void {
    this.clearNations();
    this.clearLeagues();
    this.nationFilterControl.setValue('');
    this.dateFilterControl.setValue('');
    this.sortControl.setValue('probability');
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

  get calibrationMeta(): MultigolScoutCalibrationSummary | null {
    const base = this.pickResults.calibration() ?? this.calibration;
    if (!base || !this.hasActiveFilters) {
      return base;
    }
    const key = [
      this.pickResults.revision(),
      [...this.selectedNationKeys].sort().join(','),
      this.nationFilterControl.value,
      this.dateFilterControl.value,
    ].join('|');
    const cache = this.filteredCalibrationCache;
    if (cache && cache.key === key && cache.base === base && cache.items === this.allItems) {
      return cache.value;
    }
    const value = calibrationForItems(base, this.filteredItems(), this.pickResults.all());
    this.filteredCalibrationCache = { key, base, items: this.allItems, value };
    return value;
  }

  isTopPick(item: MultigolOpportunity): boolean {
    return this.synthesisPercent(item) >= 90;
  }

  teamInitial(name: string): string {
    const trimmed = name.trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
  }

  pickStatusLabel(matchId: number): string {
    const result = this.pickResultFor(matchId);
    if (result === 'WON') {
      return 'Presa';
    }
    if (result === 'LOST') {
      return 'Persa';
    }
    return 'In Corso';
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

  itemLeagueKey(item: MultigolOpportunity): string {
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

  private itemDateKey(utcDate: string): string {
    const d = new Date(utcDate);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private dateFilterBounds(): { min: string; max: string } {
    let min = '';
    let max = '';
    for (const item of this.relevantItems) {
      const key = this.itemDateKey(item.utcDate);
      if (!min || key < min) {
        min = key;
      }
      if (!max || key > max) {
        max = key;
      }
    }
    return { min, max };
  }

  private setDefaultRange(): void {
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 86400000);
    this.from = start.toISOString().slice(0, 10);
    this.to = end.toISOString().slice(0, 10);
  }

  private restoreListFilters(): void {
    const saved = this.listFilters.read();
    this.selectedNationKeys = new Set();
    this.selectedLeagueKeys = new Set();
    this.nationFilterControl.setValue(saved.nationKeys[0] ?? '', { emitEvent: false });
    this.dateFilterControl.setValue(saved.dates[0] ?? '', { emitEvent: false });
    this.sortControl.setValue(saved.sort, { emitEvent: false });
  }

  private bindListFilterPersistence(): void {
    const persistToolbar = (): void => {
      this.listFilters.save({
        nationKeys: this.nationFilterControl.value ? [this.nationFilterControl.value] : [],
        leagueKeys: [],
        dates: this.dateFilterControl.value ? [this.dateFilterControl.value] : [],
        sort: this.sortControl.value,
      });
    };
    this.nationFilterControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => persistToolbar());
    this.dateFilterControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => persistToolbar());
    this.sortControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => persistToolbar());
  }

  private persistChipFilters(): void {
    this.listFilters.save({
      nationKeys: [...this.selectedNationKeys],
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
