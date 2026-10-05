import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/services/api.service';
import {
  MultigolAnalysis,
  MultigolFormGoalEntry,
  MultigolH2hMatchEntry,
  MultigolStandingSnapshot,
  MultigolVenueStatSlice,
} from '../../core/models';
import { areaFlagView, type AreaFlagView } from './area-flag.util';
import { formatMultigolKickoff, formatMultigolShortDate } from './multigol-format.util';

@Component({
  selector: 'app-multigol-scout-match',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  templateUrl: './multigol-scout-match.component.html',
  styleUrl: './multigol-scout-match.component.scss',
})
export class MultigolScoutMatchComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  loading = true;
  error: string | null = null;
  data: MultigolAnalysis | null = null;

  /** Filtro forma gol: casa, trasferta o tutti gli incontri. */
  private readonly formVenueFilterByTeam = new Map<number, 'home' | 'away' | 'all'>();

  /** Filtro testa a testa (rispetto alla squadra casa della partita in analisi). */
  h2hVenueFilter: 'home' | 'away' | 'all' = 'all';

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id)) {
      this.error = 'Partita non valida.';
      this.loading = false;
      return;
    }
    this.loadAnalysis(id);
  }

  retry(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isFinite(id)) {
      this.loadAnalysis(id);
    }
  }

  formatKickoff(utcDate: string): string {
    return formatMultigolKickoff(utcDate);
  }

  formatFormDate(utcDate: string): string {
    return formatMultigolShortDate(utcDate);
  }

  formVenueLabel(venue: MultigolFormGoalEntry['venue']): string {
    return venue === 'home' ? 'Casa' : 'Trasferta';
  }

  formGoalsEntries(
    detail: MultigolFormGoalEntry[] | null | undefined,
  ): MultigolFormGoalEntry[] | null {
    if (!detail?.length) {
      return null;
    }
    return [...detail].sort(
      (a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime(),
    );
  }

  formVenueFilter(teamId: number): 'home' | 'away' | 'all' {
    return this.formVenueFilterByTeam.get(teamId) ?? 'all';
  }

  setFormVenueFilter(teamId: number, venue: 'home' | 'away' | 'all'): void {
    this.formVenueFilterByTeam.set(teamId, venue);
  }

  compareVenueScopeSuffix(teamId: number): string {
    const venue = this.formVenueFilter(teamId);
    if (venue === 'home') {
      return ' · solo casa';
    }
    if (venue === 'away') {
      return ' · solo trasferta';
    }
    return '';
  }

  venueStatSlice(data: MultigolAnalysis, forHomeTeam: boolean): MultigolVenueStatSlice {
    const teamId = forHomeTeam ? data.homeTeam.id : data.awayTeam.id;
    const filter = this.formVenueFilter(teamId);
    const bundle = forHomeTeam ? data.stats.homeVenueStats : data.stats.awayVenueStats;
    if (bundle) {
      return bundle[filter];
    }
    return {
      standingDetail: forHomeTeam
        ? data.stats.homeStandingDetail ?? null
        : data.stats.awayStandingDetail ?? null,
      lambda: forHomeTeam ? data.lambdaHome : data.lambdaAway,
      pMultigol1to6: forHomeTeam ? data.pHome1to6 : data.pAway1to6,
      bandRate: forHomeTeam ? data.stats.homeBandRate : data.stats.awayBandRate,
    };
  }

  formVenueFilterEmptyLabel(teamId: number): string {
    const venue = this.formVenueFilter(teamId);
    if (venue === 'home') {
      return 'in casa';
    }
    if (venue === 'away') {
      return 'in trasferta';
    }
    return '';
  }

  showBandEmpirica(slice: MultigolVenueStatSlice): boolean {
    if (slice.bandMatches != null && slice.bandMatches > 0) {
      return true;
    }
    return slice.bandRate != null;
  }

  bandEmpiricaDisplay(slice: MultigolVenueStatSlice): string {
    if (slice.bandRate != null) {
      return `${Math.round(slice.bandRate * 100)}%`;
    }
    const n = slice.bandMatches ?? 0;
    const hits = slice.bandHits ?? 0;
    if (n > 0) {
      const pct = Math.round((hits / n) * 100);
      return `${pct}% (${hits}/${n}, campione piccolo)`;
    }
    return '';
  }

  h2hEntries(detail: MultigolH2hMatchEntry[] | null | undefined): MultigolH2hMatchEntry[] | null {
    if (!detail?.length) {
      return null;
    }
    return [...detail].sort(
      (a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime(),
    );
  }

  setH2hVenueFilter(venue: 'home' | 'away' | 'all'): void {
    this.h2hVenueFilter = venue;
  }

  h2hFixtureVenueLabel(entry: MultigolH2hMatchEntry): string {
    return entry.fixtureHomeAtHome ? 'Casa' : 'Trasferta';
  }

  h2hVenueFilterEmptyLabel(): string {
    if (this.h2hVenueFilter === 'home') {
      return 'in casa';
    }
    if (this.h2hVenueFilter === 'away') {
      return 'in trasferta';
    }
    return '';
  }

  filteredH2hEntries(
    detail: MultigolH2hMatchEntry[] | null | undefined,
  ): MultigolH2hMatchEntry[] | null {
    const all = this.h2hEntries(detail);
    if (!all) {
      return null;
    }
    if (this.h2hVenueFilter === 'all') {
      return all;
    }
    const atHome = this.h2hVenueFilter === 'home';
    return all.filter((entry) => entry.fixtureHomeAtHome === atHome);
  }

  filteredFormGoalsEntries(
    detail: MultigolFormGoalEntry[] | null | undefined,
    teamId: number,
  ): MultigolFormGoalEntry[] | null {
    const all = this.formGoalsEntries(detail);
    if (!all) {
      return null;
    }
    const venue = this.formVenueFilter(teamId);
    if (venue === 'all') {
      return all;
    }
    return all.filter((entry) => entry.venue === venue);
  }

  teamCrestUrl(team: { id: number; crest: string | null }): string {
    const url = team.crest?.trim();
    if (url) {
      return url;
    }
    return `https://crests.football-data.org/${team.id}.png`;
  }

  opponentCrestUrl(entry: MultigolFormGoalEntry): string | null {
    const url = entry.opponentCrest?.trim();
    if (url) {
      return url;
    }
    if (entry.opponentId != null) {
      return `https://crests.football-data.org/${entry.opponentId}.png`;
    }
    return null;
  }

  /** Casa a sinistra, ospite a destra; risultato in ordine casa–ospite. */
  formMatchRow(
    team: { id: number; name: string; crest: string | null },
    entry: MultigolFormGoalEntry,
  ): {
    home: { name: string; crestUrl: string | null; isSubject: boolean };
    away: { name: string; crestUrl: string | null; isSubject: boolean };
    scoreHome: number;
    scoreAway: number;
  } {
    const subject = {
      name: team.name,
      crestUrl: this.teamCrestUrl(team),
      isSubject: true,
    };
    const opponent = {
      name: entry.opponentName,
      crestUrl: this.opponentCrestUrl(entry),
      isSubject: false,
    };
    if (entry.venue === 'home') {
      return {
        home: subject,
        away: opponent,
        scoreHome: entry.goalsScored,
        scoreAway: entry.goalsConceded,
      };
    }
    return {
      home: opponent,
      away: subject,
      scoreHome: entry.goalsConceded,
      scoreAway: entry.goalsScored,
    };
  }

  nationFlag(areaCode: string | null | undefined, areaName: string): AreaFlagView | null {
    return areaFlagView(areaCode, areaName);
  }

  pickProbabilityPercent(data: MultigolAnalysis): string {
    if (!data.pick) {
      return '—';
    }
    return (Math.round(data.pick.probability * 1000) / 10).toFixed(1);
  }

  onCrestError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (img) {
      img.hidden = true;
    }
  }

  standingDetail(
    detail: MultigolStandingSnapshot | null | undefined,
    line: string,
    teamName: string,
  ): MultigolStandingSnapshot | null {
    if (detail) {
      return detail;
    }
    return this.parseStandingLine(this.statLineBody(line, teamName));
  }

  standingGoalDiff(st: MultigolStandingSnapshot): string {
    const diff = st.goalsFor - st.goalsAgainst;
    if (diff > 0) {
      return `+${diff}`;
    }
    return String(diff);
  }

  /** Rimuove il prefisso "Nome squadra:" dalle righe testuali del backend. */
  statLineBody(line: string, teamName: string): string {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    const name = teamName.trim().toLowerCase();
    if (lower.startsWith(name)) {
      const rest = trimmed.slice(teamName.length).trim();
      if (rest.startsWith(':')) {
        return rest.slice(1).trim();
      }
    }
    const colon = trimmed.indexOf(':');
    return colon >= 0 ? trimmed.slice(colon + 1).trim() : trimmed;
  }

  private parseStandingLine(body: string): MultigolStandingSnapshot | null {
    if (/non disponibile/i.test(body)) {
      return null;
    }
    const m = body.match(
      /^(\d+)° posto, (\d+) pt, (\d+) gol fatti e (\d+) subiti in (\d+) gare\.?$/,
    );
    if (!m) {
      return null;
    }
    return {
      position: Number(m[1]),
      points: Number(m[2]),
      goalsFor: Number(m[3]),
      goalsAgainst: Number(m[4]),
      playedGames: Number(m[5]),
    };
  }

  private loadAnalysis(id: number): void {
    this.loading = true;
    this.error = null;
    this.formVenueFilterByTeam.clear();
    this.h2hVenueFilter = 'all';
    this.api.getMultigolAnalysis(id).subscribe({
      next: (res) => {
        this.data = res;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.message ?? 'Analisi non disponibile.';
        this.loading = false;
      },
    });
  }
}
