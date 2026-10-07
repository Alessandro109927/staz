import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/services/api.service';
import { ApiFootballUsageService } from '../../core/services/api-football-usage.service';
import {
  MultigolAnalysis,
  MultigolApiFootballMatchSideStats,
  MultigolApiFootballSeasonStats,
  MultigolFormGoalEntry,
  MultigolH2hMatchEntry,
  MultigolStandingSnapshot,
  MultigolVenueStatSlice,
} from '../../core/models';
import { areaFlagView, type AreaFlagView } from './area-flag.util';
import {
  formatMultigolEmpiricalPercent,
  formatMultigolKickoff,
  formatMultigolMatchdayLabel,
  formatMultigolProbabilityPercent,
  formatMultigolShortDate,
} from './multigol-format.util';
import { pickSidePoissonFraction, pickSideTeamLabel } from './multigol-pick.util';
import {
  blendScoutProbabilityHint,
  blendScoutProbabilityPercent,
} from './multigol-blend.util';
import {
  multigolProbabilityBlockToneClass,
  multigolProbabilityToneClass,
  multigolProbabilityToneHint,
} from './multigol-probability-tone.util';

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
  private readonly apiFootballUsage = inject(ApiFootballUsageService);

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
    this.loadAnalysis(id, false);
  }

  retry(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isFinite(id)) {
      this.loadAnalysis(id, true);
    }
  }

  formatKickoff(utcDate: string): string {
    return formatMultigolKickoff(utcDate);
  }

  formatMatchday(data: MultigolAnalysis): string | null {
    return formatMultigolMatchdayLabel(data.matchday, data.roundLabel);
  }

  formatFormDate(utcDate: string): string {
    return formatMultigolShortDate(utcDate);
  }

  /** Allineato al default backend (solo etichetta UI). */
  h2hMatchLimit(): number {
    return 40;
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

  bandRateLabel(rate: number | null | undefined): string {
    if (rate == null) {
      return '—';
    }
    return `${Math.round(rate * 100)}%`;
  }

  bandRateDisplay(rate: number | null | undefined): string {
    if (rate == null) {
      return '— (meno di 3 gare nel campione)';
    }
    return this.bandRateLabel(rate);
  }

  pickEmpiricalPercentOnly(data: MultigolAnalysis): string | null {
    const pick = data.pick;
    if (!pick || pick.empiricalMatches <= 0 || pick.empiricalProbability == null) {
      return null;
    }
    return formatMultigolProbabilityPercent(pick.empiricalProbability * 100);
  }

  empiricalSampleLabel(data: MultigolAnalysis): string {
    const pick = data.pick;
    if (!pick || pick.empiricalMatches <= 0) {
      return '0 gare';
    }
    return `${pick.empiricalHits}/${pick.empiricalMatches} gare`;
  }

  venueEmpiricaDisplay(
    slice: MultigolVenueStatSlice,
    globalRate: number | null | undefined,
  ): string {
    const fromSlice = this.bandEmpiricaDisplay(slice);
    if (fromSlice) {
      const n = slice.bandMatches ?? 0;
      const hits = slice.bandHits ?? 0;
      if (n > 0) {
        return `${fromSlice} (${hits}/${n} gare)`;
      }
      return fromSlice;
    }
    if (globalRate != null) {
      return `${this.bandRateLabel(globalRate)} (aggregate)`;
    }
    return '— (campione insufficiente)';
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
      return `${pct}%`;
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

  teamCrestUrl(team: { id: number; crest: string | null }): string | null {
    const url = team.crest?.trim();
    if (url) {
      return url;
    }
    return null;
  }

  opponentCrestUrl(entry: MultigolFormGoalEntry): string | null {
    const url = entry.opponentCrest?.trim();
    if (url) {
      return url;
    }
    if (entry.opponentId != null) {
      return null;
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
  } | null {
    if (
      entry.scoreHome != null &&
      entry.scoreAway != null &&
      entry.homeTeamName &&
      entry.awayTeamName
    ) {
      const homeId = entry.homeTeamId;
      const awayId = entry.awayTeamId;
      return {
        home: {
          name: entry.homeTeamName,
          crestUrl: entry.homeTeamCrest?.trim() || null,
          isSubject: homeId === team.id || entry.homeTeamName === team.name,
        },
        away: {
          name: entry.awayTeamName,
          crestUrl: entry.awayTeamCrest?.trim() || null,
          isSubject: awayId === team.id || entry.awayTeamName === team.name,
        },
        scoreHome: entry.scoreHome,
        scoreAway: entry.scoreAway,
      };
    }

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

  pickPoissonPercent(data: MultigolAnalysis): string {
    const p = pickSidePoissonFraction(data);
    if (p == null) {
      return '—';
    }
    return formatMultigolProbabilityPercent(p * 100);
  }

  venuePoissonPercent(slice: MultigolVenueStatSlice): string {
    return formatMultigolProbabilityPercent(slice.pMultigol1to6 * 100);
  }

  venuePoissonPercentNumber(slice: MultigolVenueStatSlice): number {
    return slice.pMultigol1to6 * 100;
  }

  venueEmpiricalPercentNumber(
    slice: MultigolVenueStatSlice,
    globalRate: number | null | undefined,
  ): number | null {
    if (slice.bandRate != null) {
      return slice.bandRate * 100;
    }
    const n = slice.bandMatches ?? 0;
    const hits = slice.bandHits ?? 0;
    if (n > 0) {
      return (hits / n) * 100;
    }
    if (globalRate != null) {
      return globalRate * 100;
    }
    return null;
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

  pickPoissonPercentNumber(data: MultigolAnalysis): number | null {
    const p = pickSidePoissonFraction(data);
    return p == null ? null : p * 100;
  }

  pickEmpiricalPercentNumber(data: MultigolAnalysis): number | null {
    const pick = data.pick;
    if (!pick || pick.empiricalMatches <= 0 || pick.empiricalProbability == null) {
      return null;
    }
    return pick.empiricalProbability * 100;
  }

  pickSynthesisPercent(data: MultigolAnalysis): number | null {
    const pick = data.pick;
    if (!pick) {
      return null;
    }
    return blendScoutProbabilityPercent(
      pick.probability * 100,
      pick.empiricalProbability != null ? pick.empiricalProbability * 100 : null,
      pick.empiricalMatches,
      pick.xgLambdaSide ?? null,
      pick.xgSampleMatches ?? 0,
    );
  }

  pickSynthesisHint(data: MultigolAnalysis): string {
    const pick = data.pick;
    return blendScoutProbabilityHint(
      pick?.empiricalMatches ?? 0,
      pick?.xgSampleMatches ?? 0,
      pick?.xgLambdaSide ?? null,
    );
  }

  pickSideTeamName(data: MultigolAnalysis): string {
    return pickSideTeamLabel(data);
  }

  pickVenueScopeSuffix(data: MultigolAnalysis): string {
    const pick = data.pick;
    if (!pick) {
      return '';
    }
    if (pick.outcomeLabel === 'Multigol Casa 1-6') {
      return ' · solo casa';
    }
    if (pick.outcomeLabel === 'Multigol Ospite 1-6') {
      return ' · solo trasferta';
    }
    return '';
  }

  pickEmpiricalLabel(data: MultigolAnalysis): string | null {
    const pick = data.pick;
    if (!pick) {
      return null;
    }
    return formatMultigolEmpiricalPercent({
      empiricalProbabilityPercent:
        pick.empiricalProbability != null ? pick.empiricalProbability * 100 : null,
      empiricalSampleHits: pick.empiricalHits,
      empiricalSampleMatches: pick.empiricalMatches,
    });
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

  fixtureCompareRows(
    data: MultigolAnalysis,
  ): { label: string; home: string; away: string }[] {
    const fx = data.stats.apiFootballFixture;
    if (!fx) {
      return [];
    }
    const cell = (n: number | null, suffix = '') =>
      n == null ? '—' : `${n}${suffix}`;
    const defs: {
      label: string;
      pick: (s: MultigolApiFootballMatchSideStats) => number | null;
      suffix?: string;
    }[] = [
      { label: 'Possesso', pick: (s) => s.possessionPct, suffix: '%' },
      { label: 'Tiri', pick: (s) => s.shotsTotal },
      { label: 'In porta', pick: (s) => s.shotsOnTarget },
      { label: 'Corner', pick: (s) => s.corners },
      { label: 'Falli', pick: (s) => s.fouls },
      { label: 'Gialli', pick: (s) => s.yellowCards },
      { label: 'Rossi', pick: (s) => s.redCards },
      { label: 'xG', pick: (s) => s.expectedGoals },
    ];
    return defs
      .map((d) => ({
        label: d.label,
        home: cell(d.pick(fx.home), d.suffix),
        away: cell(d.pick(fx.away), d.suffix),
      }))
      .filter((r) => r.home !== '—' || r.away !== '—');
  }

  compareSeasonStatsVisible(
    teamId: number,
    apiStats: MultigolApiFootballSeasonStats | null | undefined,
  ): boolean {
    if (this.formVenueFilter(teamId) !== 'all') {
      return true;
    }
    return apiStats != null;
  }

  compareSeasonRows(
    teamId: number,
    formDetail: MultigolFormGoalEntry[] | null | undefined,
    apiStats: MultigolApiFootballSeasonStats | null | undefined,
  ): { label: string; value: string }[] {
    const venue = this.formVenueFilter(teamId);
    if (venue === 'all') {
      return this.apiFootballSeasonRows(apiStats);
    }
    return this.formVenueSeasonRows(formDetail, teamId);
  }

  private formVenueSeasonRows(
    detail: MultigolFormGoalEntry[] | null | undefined,
    teamId: number,
  ): { label: string; value: string }[] {
    const entries = this.filteredFormGoalsEntries(detail, teamId);
    if (!entries?.length) {
      return [];
    }
    let wins = 0;
    let draws = 0;
    let loses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let cleanSheets = 0;
    let failedToScore = 0;
    const formChars: string[] = [];
    const chronological = [...entries].sort(
      (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
    );
    for (const entry of chronological) {
      goalsFor += entry.goalsScored;
      goalsAgainst += entry.goalsConceded;
      if (entry.goalsScored > entry.goalsConceded) {
        wins += 1;
        formChars.push('W');
      } else if (entry.goalsScored === entry.goalsConceded) {
        draws += 1;
        formChars.push('D');
      } else {
        loses += 1;
        formChars.push('L');
      }
      if (entry.goalsConceded === 0) {
        cleanSheets += 1;
      }
      if (entry.goalsScored === 0) {
        failedToScore += 1;
      }
    }
    const played = entries.length;
    const fmt = (n: number) =>
      n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return [
      { label: 'Forma', value: formChars.join('') },
      {
        label: 'Gare',
        value: `${played} (${wins}V-${draws}N-${loses}P)`,
      },
      { label: 'Gol/gara', value: fmt(goalsFor / played) },
      { label: 'Subiti/gara', value: fmt(goalsAgainst / played) },
      { label: 'Clean sheet', value: String(cleanSheets) },
      { label: 'Zero gol', value: String(failedToScore) },
    ];
  }

  apiFootballSeasonRows(
    stats: MultigolApiFootballSeasonStats | null | undefined,
  ): { label: string; value: string }[] {
    if (!stats) {
      return [];
    }
    const fmt = (n: number | null) =>
      n == null ? null : n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const rows: { label: string; value: string }[] = [];
    if (stats.form) {
      rows.push({ label: 'Forma', value: stats.form });
    }
    if (stats.played != null) {
      rows.push({
        label: 'Gare',
        value: `${stats.played} (${stats.wins ?? 0}V-${stats.draws ?? 0}N-${stats.loses ?? 0}P)`,
      });
    }
    if (stats.avgGoalsFor != null) {
      rows.push({ label: 'Gol/gara', value: String(fmt(stats.avgGoalsFor)) });
    }
    if (stats.avgGoalsAgainst != null) {
      rows.push({ label: 'Subiti/gara', value: String(fmt(stats.avgGoalsAgainst)) });
    }
    if (stats.avgGoalsForHome != null) {
      rows.push({ label: 'Gol/gara casa', value: String(fmt(stats.avgGoalsForHome)) });
    }
    if (stats.avgGoalsForAway != null) {
      rows.push({ label: 'Gol/gara trasf.', value: String(fmt(stats.avgGoalsForAway)) });
    }
    if (stats.cleanSheets != null) {
      rows.push({ label: 'Clean sheet', value: String(stats.cleanSheets) });
    }
    if (stats.failedToScore != null) {
      rows.push({ label: 'Zero gol', value: String(stats.failedToScore) });
    }
    if (stats.yellowCardsAvg != null) {
      rows.push({ label: 'Gialli/gara', value: String(fmt(stats.yellowCardsAvg)) });
    }
    if (stats.redCardsAvg != null) {
      rows.push({ label: 'Rossi/gara', value: String(fmt(stats.redCardsAvg)) });
    }
    if (stats.formation) {
      rows.push({ label: 'Modulo', value: stats.formation });
    }
    if (stats.penaltiesScored != null || stats.penaltiesMissed != null) {
      rows.push({
        label: 'Rigori',
        value: `${stats.penaltiesScored ?? 0} segnati, ${stats.penaltiesMissed ?? 0} sbagliati`,
      });
    }
    return rows;
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

  private loadAnalysis(id: number, refresh: boolean): void {
    this.loading = true;
    this.error = null;
    this.formVenueFilterByTeam.clear();
    this.h2hVenueFilter = 'all';
    this.api.getMultigolAnalysis(id, { refresh }).subscribe({
      next: (res) => {
        this.data = res;
        this.loading = false;
        this.apiFootballUsage.refresh();
      },
      error: (err) => {
        this.error = err.error?.message ?? 'Analisi non disponibile.';
        this.loading = false;
      },
    });
  }
}
