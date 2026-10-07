import { Injectable } from '@angular/core';

export type MultigolScoutSortMode = 'date' | 'probability';

export type MultigolScoutListFiltersState = {
  nationKeys: string[];
  leagueKeys: string[];
  outcomes: string[];
  dates: string[];
  minSynthesis: string;
  sort: MultigolScoutSortMode;
  leagueSearch: string;
};

const DEFAULTS: MultigolScoutListFiltersState = {
  nationKeys: [],
  leagueKeys: [],
  outcomes: [],
  dates: [],
  minSynthesis: '0',
  sort: 'date',
  leagueSearch: '',
};

/** Filtri lista Scout: sopravvivono a dettaglio partita e ad altre route. */
@Injectable({ providedIn: 'root' })
export class MultigolScoutListFiltersService {
  private state: MultigolScoutListFiltersState = { ...DEFAULTS };

  read(): MultigolScoutListFiltersState {
    return {
      ...this.state,
      nationKeys: [...this.state.nationKeys],
      leagueKeys: [...this.state.leagueKeys],
      outcomes: [...this.state.outcomes],
      dates: [...this.state.dates],
    };
  }

  save(patch: Partial<MultigolScoutListFiltersState>): void {
    this.state = {
      ...this.state,
      ...patch,
      nationKeys: patch.nationKeys
        ? [...patch.nationKeys]
        : [...this.state.nationKeys],
      leagueKeys: patch.leagueKeys
        ? [...patch.leagueKeys]
        : [...this.state.leagueKeys],
      outcomes: patch.outcomes ? [...patch.outcomes] : [...this.state.outcomes],
      dates: patch.dates ? [...patch.dates] : [...this.state.dates],
    };
  }

  reset(): void {
    this.state = { ...DEFAULTS, nationKeys: [], leagueKeys: [], outcomes: [], dates: [] };
  }
}
