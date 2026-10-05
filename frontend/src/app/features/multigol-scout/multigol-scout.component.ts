import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subscription, from } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { MultigolOpportunity, MultigolScoutCompetition } from '../../core/models';
import {
  VsSelectFieldComponent,
  VsSelectOption,
} from '../../shared/vs-select-field/vs-select-field.component';
import { areaFlagView, type AreaFlagView } from './area-flag.util';
import { formatMultigolKickoff } from './multigol-format.util';

type MultigolSortMode = 'date' | 'probability';

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
    VsSelectFieldComponent,
  ],
  templateUrl: './multigol-scout.component.html',
  styleUrl: './multigol-scout.component.scss',
})
export class MultigolScoutComponent implements OnInit {
  private readonly api = inject(ApiService);
  private loadSub?: Subscription;

  loading = true;
  error: string | null = null;
  from = '';
  to = '';
  competitions: MultigolScoutCompetition[] = [];
  /** Tutte le opportunità caricate (senza filtri). */
  allItems: MultigolOpportunity[] = [];
  selectedNationKeys = new Set<string>();
  sortControl = new FormControl<MultigolSortMode>('date', { nonNullable: true });
  readonly sortOptions: VsSelectOption[] = [
    { value: 'date', label: 'Data partita' },
    { value: 'probability', label: 'Probabilità' },
  ];
  progressLabel = '';
  loadedLeagues = 0;
  totalLeagues = 0;

  ngOnInit(): void {
    this.setDefaultRange();
    this.bootstrapCompetitions();
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

  get displayItems(): MultigolOpportunity[] {
    let list = this.allItems;
    if (this.selectedNationKeys.size > 0) {
      list = list.filter((item) => {
        const key = this.itemNationKey(item);
        return key != null && this.selectedNationKeys.has(key);
      });
    }
    const mode = this.sortControl.value;
    const sorted = [...list];
    if (mode === 'probability') {
      sorted.sort((a, b) => b.probabilityPercent - a.probabilityPercent);
    } else {
      sorted.sort(
        (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
      );
    }
    return sorted;
  }

  reload(): void {
    this.allItems = [];
    this.loadedLeagues = 0;
    if (this.competitions.length) {
      this.loadProgressive(this.competitions.map((c) => c.key));
    } else {
      this.bootstrapCompetitions();
    }
  }

  nationFlag(areaCode: string | null, areaName: string): AreaFlagView | null {
    return areaFlagView(areaCode, areaName);
  }

  formatKickoff(utcDate: string): string {
    return formatMultigolKickoff(utcDate);
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
  }

  clearNations(): void {
    this.selectedNationKeys = new Set();
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

  private bootstrapCompetitions(): void {
    this.loading = true;
    this.error = null;
    this.api.getMultigolCompetitions().subscribe({
      next: (comps) => {
        this.competitions = comps;
        this.totalLeagues = comps.length;
        this.loadProgressive(comps.map((c) => c.key));
      },
      error: (err) => {
        this.error =
          err.error?.message ?? 'Impossibile caricare l’elenco campionati.';
        this.loading = false;
      },
    });
  }

  private loadProgressive(leagueKeys: string[]): void {
    this.loadSub?.unsubscribe();
    this.loading = true;
    this.error = null;
    this.allItems = [];
    this.loadedLeagues = 0;

    if (!leagueKeys.length) {
      this.loading = false;
      return;
    }

    this.loadSub = from(leagueKeys)
      .pipe(
        concatMap((key) => {
          this.progressLabel = `Scansione ${this.leagueLabel(key)} (${this.loadedLeagues + 1}/${this.totalLeagues})…`;
          return this.api.getMultigolLeagueOpportunities(key, this.from, this.to);
        }),
      )
      .subscribe({
        next: (part) => {
          this.loadedLeagues += 1;
          this.allItems = [...this.allItems, ...part];
        },
        error: (err) => {
          this.error = err.error?.message ?? 'Impossibile caricare le opportunità.';
          this.loading = false;
          this.progressLabel = '';
        },
        complete: () => {
          this.loading = false;
          this.progressLabel = '';
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
