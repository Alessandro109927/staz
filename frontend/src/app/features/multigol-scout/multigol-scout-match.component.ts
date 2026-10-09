import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
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
  formatMultigolDetailSchedule,
  formatMultigolSyncAge,
  formatMultigolEmpiricalPercent,
  formatMultigolKickoff,
  formatMultigolMatchdayLabel,
  formatMultigolProbabilityPercent,
  formatMultigolH2hTableDate,
  formatMultigolShortDate,
} from './multigol-format.util';
import { NewBetDialogService } from '../new-bet/new-bet-dialog.service';
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
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly newBetDialog = inject(NewBetDialogService);

  loading = true;
  error: string | null = null;
  data: MultigolAnalysis | null = null;
  snapshotBuiltAt: string | null = null;

  /** Filtro forma gol: casa, trasferta o tutti gli incontri. */
  private readonly formVenueFilterByTeam = new Map<number, 'home' | 'away' | 'all'>();

  /** Filtro testa a testa (rispetto alla squadra casa della partita in analisi). */
  h2hVenueFilter: 'home' | 'away' | 'all' = 'all';

  private readonly crestLoadFailedIds = new Set<number>();

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id)) {
      this.error = 'Partita non valida.';
      this.loading = false;
      return;
    }
    this.loadAnalysis(id, false);
    this.api.getMultigolSnapshot().subscribe({
      next: (snap) => {
        this.snapshotBuiltAt = snap.meta.builtAt;
      },
      error: () => {
        this.snapshotBuiltAt = null;
      },
    });
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

  formatDetailSchedule(utcDate: string): string {
    return formatMultigolDetailSchedule(utcDate);
  }

  syncAgeLabel(): string | null {
    return formatMultigolSyncAge(this.snapshotBuiltAt);
  }

  teamInitial(name: string): string {
    const trimmed = name.trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
  }

  teamStandingPosition(detail: MultigolStandingSnapshot | null | undefined): string | null {
    if (detail?.position == null || detail.position <= 0) {
      return null;
    }
    return `${detail.position}° posizione`;
  }

  teamStandingPositionLabel(data: MultigolAnalysis, side: 'home' | 'away'): string | null {
    const forHome = side === 'home';
    const slice = this.venueStatSlice(data, forHome);
    const detail = this.compareStandingSnapshot(data, forHome, slice);
    const fromDetail = this.teamStandingPosition(detail);
    if (fromDetail) {
      return fromDetail;
    }
    const line = forHome ? data.stats.homeStanding : data.stats.awayStanding;
    const teamName = forHome ? data.homeTeam.name : data.awayTeam.name;
    const fromLine = this.standingPositionFromLine(line, teamName);
    return fromLine != null ? `${fromLine}° posizione` : null;
  }

  /** Classifica coerente col filtro Completo/Casa/Trasferta (non solo il campo grezzo dello slice). */
  compareStandingSnapshot(
    data: MultigolAnalysis,
    forHomeTeam: boolean,
    slice: MultigolVenueStatSlice,
  ): MultigolStandingSnapshot | null {
    const teamId = forHomeTeam ? data.homeTeam.id : data.awayTeam.id;
    const teamName = forHomeTeam ? data.homeTeam.name : data.awayTeam.name;
    const filter = this.formVenueFilter(teamId);
    const globalDetail = forHomeTeam
      ? data.stats.homeStandingDetail
      : data.stats.awayStandingDetail;
    const standingLine = forHomeTeam ? data.stats.homeStanding : data.stats.awayStanding;
    const formDetail = forHomeTeam
      ? data.stats.homeFormGoalsDetail
      : data.stats.awayFormGoalsDetail;

    let snapshot: MultigolStandingSnapshot | null = null;

    const official =
      globalDetail ??
      slice.standingDetail ??
      this.standingDetail(null, standingLine, teamName);

    if (filter === 'all') {
      if (official?.position != null || (official?.playedGames ?? 0) > 0) {
        snapshot = official;
      } else {
        snapshot =
          this.standingFromFormGoals(formDetail, teamId, 'all') ?? official;
      }
    } else {
      snapshot =
        slice.standingDetail ??
        this.standingFromFormGoals(formDetail, teamId, filter) ??
        official;
    }

    if (!snapshot) {
      return null;
    }

    if (snapshot.position == null) {
      const fromLine = this.standingPositionFromLine(standingLine, teamName);
      const pos =
        fromLine ??
        official?.position ??
        globalDetail?.position ??
        slice.standingDetail?.position ??
        null;
      if (pos != null) {
        return { ...snapshot, position: pos };
      }
    }

    return snapshot;
  }

  private standingFromFormGoals(
    detail: MultigolFormGoalEntry[] | null | undefined,
    teamId: number,
    venue: 'all' | 'home' | 'away',
  ): MultigolStandingSnapshot | null {
    const entries =
      venue === 'all'
        ? this.formGoalsEntries(detail)
        : this.filteredFormGoalsEntries(detail, teamId);
    if (!entries?.length) {
      return null;
    }
    let playedGames = 0;
    let points = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    for (const entry of entries) {
      playedGames += 1;
      goalsFor += entry.goalsScored;
      goalsAgainst += entry.goalsConceded;
      if (entry.goalsScored > entry.goalsConceded) {
        points += 3;
      } else if (entry.goalsScored === entry.goalsConceded) {
        points += 1;
      }
    }
    return {
      position: null,
      points,
      goalsFor,
      goalsAgainst,
      playedGames,
    };
  }

  teamShowsCrest(team: { id: number; crest: string | null }): boolean {
    const url = team.crest?.trim();
    return !!url && !this.crestLoadFailedIds.has(team.id);
  }

  isTopPick(data: MultigolAnalysis): boolean {
    const synthesis = this.pickSynthesisPercent(data);
    return synthesis != null && synthesis >= 90;
  }

  matchPhaseLabel(data: MultigolAnalysis): string {
    const kickoff = new Date(data.utcDate).getTime();
    if (Number.isFinite(kickoff) && kickoff > Date.now()) {
      return 'Pre-Match Analysis';
    }
    return 'Analisi partita';
  }

  algorithmConfidence(data: MultigolAnalysis): { label: string; grade: string } {
    const p = this.pickSynthesisPercent(data) ?? 0;
    if (p >= 95) {
      return { label: 'Elevatissima', grade: 'A+' };
    }
    if (p >= 90) {
      return { label: 'Elevata', grade: 'A' };
    }
    if (p >= 85) {
      return { label: 'Alta', grade: 'B+' };
    }
    if (p >= 80) {
      return { label: 'Buona', grade: 'B' };
    }
    return { label: 'Moderata', grade: 'C' };
  }

  poissonCrossValidationSample(data: MultigolAnalysis): number | null {
    const pick = data.pick;
    if (!pick) {
      return null;
    }
    const xg = pick.xgSampleMatches ?? 0;
    const emp = pick.empiricalMatches ?? 0;
    const n = Math.max(xg, emp);
    return n > 0 ? n : null;
  }

  pickConsensusLabel(data: MultigolAnalysis): string {
    const syn = this.pickSynthesisPercent(data) ?? 0;
    const pois = this.pickPoissonPercentNumber(data) ?? 0;
    const emp = this.pickEmpiricalPercentNumber(data) ?? pois;
    const score = Math.min(10, Math.max(1, Math.round(Math.min(syn, pois, emp) / 10)));
    return `Consenso ${score}/10`;
  }

  async shareReport(): Promise<void> {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (!url) {
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Scout Multigol', url });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore cancel / permission */
    }
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

  h2hRegisteredCount(detail: MultigolH2hMatchEntry[] | null | undefined): number {
    return detail?.length ?? 0;
  }

  formatH2hTableDate(utcDate: string): string {
    return formatMultigolH2hTableDate(utcDate);
  }

  h2hMultigolBandStats(
    entries: MultigolH2hMatchEntry[] | null | undefined,
    side: 'home' | 'away',
  ): { hits: number; total: number; pct: number } | null {
    if (!entries?.length) {
      return null;
    }
    let hits = 0;
    for (const entry of entries) {
      const goals = side === 'home' ? entry.scoreHome : entry.scoreAway;
      if (goals >= 1 && goals <= 6) {
        hits += 1;
      }
    }
    const total = entries.length;
    return {
      hits,
      total,
      pct: Math.round((hits / total) * 100),
    };
  }

  h2hMultigolBandValue(
    entries: MultigolH2hMatchEntry[] | null | undefined,
    side: 'home' | 'away',
  ): string {
    const stats = this.h2hMultigolBandStats(entries, side);
    if (!stats) {
      return '-';
    }
    return `${stats.pct}% (${stats.hits}/${stats.total})`;
  }

  h2hMultigolSideForPick(data: MultigolAnalysis): 'home' | 'away' {
    const label = data.pick?.outcomeLabel ?? '';
    if (/casa/i.test(label)) {
      return 'home';
    }
    return 'away';
  }

  h2hMultigolColumnTitle(data: MultigolAnalysis): string {
    return this.h2hMultigolSideForPick(data) === 'home'
      ? 'Multigol Casa 1-6'
      : 'Multigol Ospite 1-6';
  }

  h2hMultigolRowStatus(
    entry: MultigolH2hMatchEntry,
    side: 'home' | 'away',
  ): { hit: boolean; label: string } {
    const goals = side === 'home' ? entry.scoreHome : entry.scoreAway;
    if (goals == null || Number.isNaN(goals)) {
      return { hit: false, label: '-' };
    }
    if (goals >= 1 && goals <= 6) {
      const golWord = goals === 1 ? 'gol' : 'gol';
      return { hit: true, label: `Validato (${goals} ${golWord})` };
    }
    if (goals === 0) {
      return {
        hit: false,
        label: side === 'home' ? 'Zero gol casa' : 'Zero gol ospite',
      };
    }
    return { hit: false, label: `Fuori range (${goals} gol)` };
  }

  h2hBetOutcomeLabel(entry: MultigolH2hMatchEntry, data: MultigolAnalysis): string {
    const side = this.h2hMultigolSideForPick(data);
    return this.h2hMultigolRowStatus(entry, side).hit ? 'PRESA' : 'NO HIT';
  }

  h2hSyntheticVerdict(data: MultigolAnalysis): string | null {
    const explanation = data.explanation?.trim();
    if (explanation) {
      return explanation;
    }
    const ai = data.aiExplanation?.trim();
    if (ai) {
      return ai;
    }
    const summary = data.stats.h2hSummary?.trim();
    if (summary) {
      return summary;
    }
    const analysis = data.analysis?.trim();
    return analysis || null;
  }

  h2hCompetitionLabel(
    entry: MultigolH2hMatchEntry,
    fallbackLeague: string,
  ): string {
    return entry.competitionName?.trim() || fallbackLeague || '-';
  }

  h2hFixtureLabel(entry: MultigolH2hMatchEntry): string {
    const home = entry.homeTeamName?.trim();
    const away = entry.awayTeamName?.trim();
    if (home && away) {
      return `${home} vs ${away}`;
    }
    return home || away || '-';
  }

  addPickToSlip(data: MultigolAnalysis): void {
    const pick = data.pick;
    if (!pick) {
      return;
    }
    this.newBetDialog
      .open({
        eventName: data.eventName,
        outcomeLabel: pick.outcomeLabel,
      })
      .subscribe();
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

  formMatchScoreLabel(row: {
    scoreHome: number;
    scoreAway: number;
  }): string {
    if (row.scoreHome == null || row.scoreAway == null) {
      return '-';
    }
    return `${row.scoreHome} - ${row.scoreAway}`;
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

  pickVenuePoissonMetricLabel(data: MultigolAnalysis): string {
    return this.pickSideTeamName(data) === data.awayTeam.name
      ? 'Poisson Trasf.'
      : 'Poisson Casa';
  }

  pickVenueEmpiricalMetricLabel(data: MultigolAnalysis): string {
    return this.pickSideTeamName(data) === data.awayTeam.name
      ? 'Empirica Trasf.'
      : 'Empirica Casa';
  }

  modelXgSharePercents(data: MultigolAnalysis): { home: number; away: number } {
    const total = data.lambdaHome + data.lambdaAway;
    if (total <= 0) {
      return { home: 50, away: 50 };
    }
    const home = Math.round((data.lambdaHome / total) * 1000) / 10;
    return { home, away: Math.round((100 - home) * 10) / 10 };
  }

  modelPoissonHomePercent(data: MultigolAnalysis): number {
    const slice = data.stats.homeVenueStats?.all;
    return (slice?.pMultigol1to6 ?? data.pHome1to6) * 100;
  }

  modelPoissonAwayPercent(data: MultigolAnalysis): number {
    const slice = data.stats.awayVenueStats?.away ?? data.stats.awayVenueStats?.all;
    return (slice?.pMultigol1to6 ?? data.pAway1to6) * 100;
  }

  modelLeaguePoissonBaselinePercent(data: MultigolAnalysis): number {
    return Math.round(((data.pHome1to6 + data.pAway1to6) / 2) * 1000) / 10;
  }

  modelPoissonAwayDeltaPercent(data: MultigolAnalysis): number {
    return (
      Math.round(
        (this.modelPoissonAwayPercent(data) - this.modelLeaguePoissonBaselinePercent(data)) * 10,
      ) / 10
    );
  }

  modelEmpiricalSlice(
    data: MultigolAnalysis,
    side: 'home' | 'away',
  ): MultigolVenueStatSlice | null {
    if (side === 'home') {
      return data.stats.homeVenueStats?.all ?? null;
    }
    return data.stats.awayVenueStats?.away ?? data.stats.awayVenueStats?.all ?? null;
  }

  modelEmpiricalPercent(data: MultigolAnalysis, side: 'home' | 'away'): number | null {
    const slice = this.modelEmpiricalSlice(data, side);
    if (!slice) {
      const rate = side === 'home' ? data.stats.homeBandRate : data.stats.awayBandRate;
      return rate != null ? rate * 100 : null;
    }
    return this.venueEmpiricalPercentNumber(slice, side === 'home' ? data.stats.homeBandRate : data.stats.awayBandRate);
  }

  modelEmpiricalSampleLabel(data: MultigolAnalysis, side: 'home' | 'away'): string {
    const slice = this.modelEmpiricalSlice(data, side);
    const hits = slice?.bandHits ?? 0;
    const matches = slice?.bandMatches ?? 0;
    if (matches > 0) {
      return `${hits}/${matches} match`;
    }
    if (side === 'home') {
      return data.homeTeam.name;
    }
    return data.awayTeam.name;
  }

  modelSeasonCampioneLabel(data: MultigolAnalysis): string {
    const season =
      data.stats.apiFootballHome?.season ??
      data.stats.apiFootballAway?.season ??
      new Date(data.utcDate).getFullYear();
    return `Campione reale ${season}`;
  }

  modelEmpiricalAwayFooter(data: MultigolAnalysis): string | null {
    const pct = this.modelEmpiricalPercent(data, 'away');
    const slice = this.modelEmpiricalSlice(data, 'away');
    if (
      pct != null &&
      pct >= 99.5 &&
      slice?.bandMatches != null &&
      slice.bandHits === slice.bandMatches
    ) {
      return 'Zero gare a secco trasf.';
    }
    return null;
  }

  modelAvgTotalGoalsPerMatch(data: MultigolAnalysis, side: 'home' | 'away'): number | null {
    const team = side === 'home' ? data.homeTeam : data.awayTeam;
    const detail = this.standingDetail(
      side === 'home' ? data.stats.homeStandingDetail : data.stats.awayStandingDetail,
      side === 'home' ? data.stats.homeStanding : data.stats.awayStanding,
      team.name,
    );
    if (!detail?.playedGames) {
      const api = side === 'home' ? data.stats.apiFootballHome : data.stats.apiFootballAway;
      if (api?.avgGoalsFor != null && api.avgGoalsAgainst != null) {
        return api.avgGoalsFor + api.avgGoalsAgainst;
      }
      return null;
    }
    return (detail.goalsFor + detail.goalsAgainst) / detail.playedGames;
  }

  modelH2hMultigolHistoric(
    data: MultigolAnalysis,
  ): { percent: number; matchCount: number } | null {
    const count = data.stats.h2hMatchesDetail?.length ?? 0;
    if (count <= 0) {
      return null;
    }
    const homePct = data.stats.h2hMultigolHomePct;
    const awayPct = data.stats.h2hMultigolAwayPct;
    let blended: number | null = null;
    if (homePct != null && awayPct != null) {
      blended = Math.round(((homePct + awayPct) / 2) * 10) / 10;
    } else if (homePct != null) {
      blended = homePct;
    } else if (awayPct != null) {
      blended = awayPct;
    }
    if (blended == null) {
      return null;
    }
    return { percent: blended, matchCount: count };
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

  onCrestError(event: Event, teamId?: number): void {
    if (teamId != null) {
      this.crestLoadFailedIds.add(teamId);
      this.cdr.markForCheck();
    }
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

  compareSeasonTitle(data: MultigolAnalysis): string {
    const season =
      data.stats.apiFootballHome?.season ??
      data.stats.apiFootballAway?.season ??
      new Date(data.utcDate).getFullYear();
    return `Stagione Regolare ${season}`;
  }

  lambdaLeagueDeltaHint(data: MultigolAnalysis, lambda: number): string | null {
    const leagueAvg = (data.lambdaHome + data.lambdaAway) / 2;
    if (leagueAvg <= 0) {
      return null;
    }
    const deltaPct = ((lambda - leagueAvg) / leagueAvg) * 100;
    if (Math.abs(deltaPct) < 0.5) {
      return null;
    }
    const formatted = `${Math.abs(deltaPct).toFixed(1)}%`;
    return deltaPct >= 0
      ? `+${formatted} sopra la media di lega`
      : `-${formatted} sotto la media di lega`;
  }

  lastFiveFormEntries(
    detail: MultigolFormGoalEntry[] | null | undefined,
    teamId: number,
  ): MultigolFormGoalEntry[] | null {
    const entries = this.filteredFormGoalsEntries(detail, teamId);
    if (!entries?.length) {
      return null;
    }
    return entries.slice(0, 5);
  }

  formOutcomeBadge(entry: MultigolFormGoalEntry): 'V' | 'N' | 'P' {
    if (entry.goalsScored > entry.goalsConceded) {
      return 'V';
    }
    if (entry.goalsScored === entry.goalsConceded) {
      return 'N';
    }
    return 'P';
  }

  seasonRowValue(
    rows: { label: string; value: string }[],
    ...needles: string[]
  ): string | null {
    const lower = needles.map((n) => n.toLowerCase());
    const row = rows.find((r) => lower.some((n) => r.label.toLowerCase().includes(n)));
    return row?.value ?? null;
  }

  teamGameIndicators(
    teamId: number,
    formDetail: MultigolFormGoalEntry[] | null | undefined,
    apiStats: MultigolApiFootballSeasonStats | null | undefined,
  ): {
    left: { label: string; value: string | null; accent?: boolean }[];
    right: { label: string; value: string | null; accent?: boolean }[];
  } {
    const rows = this.compareSeasonRows(teamId, formDetail, apiStats);
    const pick = (...keys: string[]): string | null =>
      this.seasonRowValue(rows, ...keys);

    const cleanSheet = (): string | null => {
      const raw = pick('clean');
      return raw ? `${raw} partite` : null;
    };

    const left: { label: string; value: string | null; accent?: boolean }[] = [
      { label: 'Forma Gare', value: pick('gare') ?? pick('forma') },
      {
        label: 'Gol Subiti / Gara Casa',
        value: pick('subiti', 'casa') ?? pick('subiti'),
      },
      { label: 'Partite con Zero Gol', value: pick('zero gol') },
      { label: 'Cartellini Gialli / Gara', value: pick('gialli') },
    ];
    const right: { label: string; value: string | null; accent?: boolean }[] = [
      { label: 'Media Gol Fatti/Gara', value: pick('gol/gara') },
      { label: 'Clean Sheet', value: cleanSheet() },
      { label: 'Modulo Tattico', value: pick('modulo'), accent: true },
      { label: 'Rigori', value: pick('rigori') },
    ];
    return { left, right };
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

  private standingPositionFromLine(line: string, teamName: string): number | null {
    const body = this.statLineBody(line, teamName);
    const source = body || line;
    const match = source.match(/(\d+)\s*°/);
    if (!match) {
      return null;
    }
    const position = Number(match[1]);
    return Number.isFinite(position) && position > 0 ? position : null;
  }

  private parseStandingLine(body: string): MultigolStandingSnapshot | null {
    if (/non disponibile/i.test(body)) {
      return null;
    }
    const m = body.match(
      /^(\d+)° posto, (\d+) pt, (\d+) gol fatti e (\d+) subiti in (\d+) gare\.?$/,
    );
    if (m) {
      return {
        position: Number(m[1]),
        points: Number(m[2]),
        goalsFor: Number(m[3]),
        goalsAgainst: Number(m[4]),
        playedGames: Number(m[5]),
      };
    }
    const pos = this.standingPositionFromLine(body, '');
    if (pos == null) {
      return null;
    }
    return {
      position: pos,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      playedGames: 0,
    };
  }

  private loadAnalysis(id: number, refresh: boolean): void {
    this.loading = true;
    this.error = null;
    this.formVenueFilterByTeam.clear();
    this.h2hVenueFilter = 'all';
    this.crestLoadFailedIds.clear();
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
