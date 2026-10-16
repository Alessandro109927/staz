import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FdMatch, FdStandingRow } from './football-data.types';
import { ApiFootballClient } from './api-football.client';
import { SCOUT_LEAGUE_META } from './api-football.constants';
import {
  buildDossier,
  deterministicExplanation,
  enrichPickWithEmpirical,
  patchFormStats,
  patchStandingFromRows,
  type MatchDossier,
} from './multigol-dossier.util';
import { OUTCOME_AWAY_1_6, OUTCOME_HOME_1_6 } from './multigol-scout.constants';
import { synthesisPercentFromPick } from './multigol-blend.util';
import type { MultigolApiFootballSeasonStats } from './api-football.types';
import {
  MULTIGOL_MODEL_VERSION,
  averageGoalsPerTeamGame,
  buildInsights,
  type MultigolModelContext,
} from './multigol-model.util';
import { MultigolNarrativeService } from './multigol-narrative.service';
import {
  DEFAULT_H2H_MATCH_LIMIT,
  DEFAULT_TEAM_FORM_MATCH_LIMIT,
  SCOUT_LEAGUE_CODES,
  SCOUT_LEAGUE_PRIORITY_CODES,
  SCOUT_UEFA_CUP_CODES,
  SCOUT_UEFA_DOMESTIC_STANDING_MIN_GAMES,
  isUefaCupLeagueCode,
  type ScoutCompetition,
} from './multigol-scout.constants';

export type { MultigolAnalysis, MultigolOpportunity } from './multigol-scout.types';
import type { MultigolAnalysis, MultigolOpportunity } from './multigol-scout.types';
import {
  MultigolScoutSnapshotMeta,
  MultigolScoutStoreService,
} from './multigol-scout-store.service';
import { MultigolScoutCalibrationService } from './multigol-scout-calibration.service';
import type {
  MultigolScoutCalibrationSummary,
  MultigolScoutPickResultValue,
} from './multigol-scout-calibration.types';

type MatchSeed = {
  match: FdMatch;
  leagueCode: string;
  leagueName: string;
  homeRow?: FdStandingRow;
  awayRow?: FdStandingRow;
};

@Injectable()
export class MultigolScoutService implements OnModuleInit {
  private readonly logger = new Logger(MultigolScoutService.name);
  /** Scansione completa in corso in questo processo Node. */
  private scanRunning = false;
  private readonly matchSeeds = new Map<number, MatchSeed>();
  private readonly leagueScanCache = new Map<
    string,
    { expiresAt: number; items: MultigolOpportunity[] }
  >();
  private readonly analysisCache = new Map<
    number,
    { expiresAt: number; value: MultigolAnalysis }
  >();
  private scoutCompetitionsCache: {
    expiresAt: number;
    items: ScoutCompetition[];
  } | null = null;

  constructor(
    private readonly apiFootball: ApiFootballClient,
    private readonly narrative: MultigolNarrativeService,
    private readonly config: ConfigService,
    private readonly store: MultigolScoutStoreService,
    private readonly calibration: MultigolScoutCalibrationService,
  ) {}

  onModuleInit(): void {
    void this.reconcileScanLock();
    // Attende che il server sia su e il DB pronto prima di un eventuale ricalcolo.
    const timer = setTimeout(() => void this.migrateModelVersion(), 20_000);
    timer.unref?.();
  }

  private async reconcileScanLock(): Promise<void> {
    const state = await this.store.getState();
    if (state?.scanInProgress && !this.scanRunning) {
      this.logger.warn(
        'Scout Multigol: flag scanInProgress orfano (riavvio server?), reset.',
      );
      await this.store.setScanInProgress(false);
    }
  }

  async getSnapshot(): Promise<{
    from: string;
    to: string;
    items: MultigolOpportunity[];
    meta: MultigolScoutSnapshotMeta;
    competitions: ScoutCompetition[];
    pickResults: Record<number, MultigolScoutPickResultValue>;
    calibration: MultigolScoutCalibrationSummary;
  }> {
    await this.reconcileScanLock();
    const [competitions, meta, items, pickResults, calibration] = await Promise.all([
      this.getCompetitions(),
      this.store.getSnapshotMeta(),
      this.store.listAll(),
      this.calibration.listPickResultsMap(),
      this.calibration.getSummary(),
    ]);
    return {
      from: meta.from,
      to: meta.to,
      items,
      meta,
      competitions,
      pickResults,
      calibration,
    };
  }

  setPickResult(
    matchId: number,
    result: MultigolScoutPickResultValue | null,
  ) {
    return this.calibration.setPickResult(matchId, result);
  }

  importPickResults(
    items: Array<{ matchId: number; result: MultigolScoutPickResultValue }>,
  ) {
    return this.calibration.importPickResults(items);
  }

  async refreshFullSnapshot(): Promise<MultigolScoutSnapshotMeta> {
    await this.reconcileScanLock();
    if (this.scanRunning) {
      return this.store.getSnapshotMeta();
    }
    this.scanRunning = true;
    await this.store.setScanInProgress(true);
    try {
      const range = await this.activeWindowRange();
      const competitions = await this.getCompetitions();
      const all: MultigolOpportunity[] = [];
      for (const league of competitions) {
        const part = await this.listLeagueOpportunities(
          league.key,
          range.from,
          range.to,
          { force: true },
        );
        all.push(...part);
      }
      all.sort(
        (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
      );
      await this.store.replaceAll(all, range.from, range.to);
      this.leagueScanCache.clear();
    } finally {
      this.scanRunning = false;
      await this.store.setScanInProgress(false);
    }
    return this.store.getSnapshotMeta();
  }

  refreshFullSnapshotBackground(): void {
    if (this.scanRunning) {
      return;
    }
    void this.refreshFullSnapshot().catch((err) => {
      this.logger.warn(`Scansione completa fallita: ${String(err)}`);
      this.scanRunning = false;
      void this.store.setScanInProgress(false);
    });
  }

  refreshLeaguesSnapshotBackground(leagueKeys: string[]): void {
    if (this.scanRunning) {
      return;
    }
    void this.refreshLeaguesSnapshot(leagueKeys).catch((err) => {
      this.logger.warn(`Scansione leghe fallita: ${String(err)}`);
      this.scanRunning = false;
      void this.store.setScanInProgress(false);
    });
  }

  /**
   * Ricalcola e sostituisce in DB solo le leghe indicate (merge snapshot, no wipe totale).
   */
  async refreshLeaguesSnapshot(
    leagueKeys: string[],
  ): Promise<MultigolScoutSnapshotMeta> {
    await this.reconcileScanLock();
    if (this.scanRunning) {
      return this.store.getSnapshotMeta();
    }
    const tokens = this.normalizeLeagueRefreshTokens(leagueKeys);
    if (!tokens.length) {
      return this.store.getSnapshotMeta();
    }

    this.scanRunning = true;
    await this.store.setScanInProgress(true);
    try {
      const range = await this.activeWindowRange();
      const competitions = await this.getCompetitions();
      const tokenSet = new Set(tokens);
      const toScan = competitions.filter(
        (c) =>
          tokenSet.has(c.key.toUpperCase()) ||
          (c.code != null && tokenSet.has(c.code.toUpperCase())) ||
          tokenSet.has(String(c.id)),
      );
      if (!toScan.length) {
        this.logger.warn(
          `Scout: nessuna competizione per leghe ${tokens.join(', ')}`,
        );
        return this.store.getSnapshotMeta();
      }

      const scannedKeys = toScan.map((c) => c.key);
      const fresh: MultigolOpportunity[] = [];
      for (const league of toScan) {
        fresh.push(
          ...(await this.listLeagueOpportunities(
            league.key,
            range.from,
            range.to,
            { force: true },
          )),
        );
      }
      fresh.sort(
        (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
      );

      await this.store.deleteByLeagueKeys(scannedKeys);
      await this.store.upsertMany(fresh);

      const state = await this.store.getState();
      const windowFrom =
        state?.windowFrom && state.windowFrom < range.from
          ? state.windowFrom
          : range.from;
      const windowTo =
        state?.windowTo && state.windowTo > range.to ? state.windowTo : range.to;
      await this.store.updateState({
        windowFrom,
        windowTo,
        lastFullScanAt: new Date(),
      });

      for (const key of scannedKeys) {
        for (const cacheKey of [...this.leagueScanCache.keys()]) {
          if (cacheKey.startsWith(`${key}:`)) {
            this.leagueScanCache.delete(cacheKey);
          }
        }
      }

      this.logger.log(
        `Scout leghe [${tokens.join(', ')}]: ${fresh.length} pick salvate`,
      );
    } finally {
      this.scanRunning = false;
      await this.store.setScanInProgress(false);
    }
    return this.store.getSnapshotMeta();
  }

  private normalizeLeagueRefreshTokens(leagueKeys: string[]): string[] {
    return [
      ...new Set(
        leagueKeys
          .map((k) => k.trim())
          .filter(Boolean)
          .map((k) => (/^\d+$/.test(k) ? k : k.toUpperCase())),
      ),
    ];
  }

  defaultUefaCupRefreshTokens(): string[] {
    return [...SCOUT_UEFA_CUP_CODES];
  }

  async runIncrementalSnapshotRefresh(): Promise<void> {
    const state = await this.store.getState();
    if (!state || !(await this.store.hasAny())) {
      await this.refreshFullSnapshot();
      return;
    }
    const nextDay = this.addDays(state.windowTo, 1);
    const competitions = await this.getCompetitions();
    const added: MultigolOpportunity[] = [];
    for (const league of competitions) {
      added.push(
        ...(await this.listLeagueOpportunities(
          league.key,
          nextDay,
          nextDay,
          { force: true },
        )),
      );
    }
    await this.store.upsertMany(added);
    await this.store.updateState({
      windowTo: nextDay,
      lastIncrementalAt: new Date(),
    });
  }

  /** Data odierna (YYYY-MM-DD) nel fuso di Roma. */
  private romeToday(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  }

  /**
   * Ricalcola con il modello corrente tutte le partite (non ancora iniziate) di un giorno,
   * in tutte le competizioni. Upsert per `matchId`: le righe già giocate/etichettate
   * non vengono mai cancellate.
   */
  async recalculateDay(
    day: string,
  ): Promise<{ day: string; leagues: number; items: number; skipped: boolean }> {
    await this.reconcileScanLock();
    if (this.scanRunning) {
      this.logger.warn(`Ricalcolo ${day} saltato: scansione già in corso.`);
      return { day, leagues: 0, items: 0, skipped: true };
    }
    this.scanRunning = true;
    await this.store.setScanInProgress(true);
    const started = Date.now();
    let leagues = 0;
    let total = 0;
    try {
      const competitions = await this.getCompetitions();
      for (const league of competitions) {
        try {
          const fresh = await this.listLeagueOpportunities(league.key, day, day, {
            force: true,
          });
          if (fresh.length) {
            await this.store.upsertMany(fresh);
            total += fresh.length;
          }
          leagues += 1;
        } catch (err) {
          this.logger.warn(`Ricalcolo ${day} ${league.key}: ${String(err)}`);
        }
      }
      const state = await this.store.getState();
      await this.store.updateState({
        windowFrom:
          state?.windowFrom && state.windowFrom < day ? state.windowFrom : day,
        windowTo: state?.windowTo && state.windowTo > day ? state.windowTo : day,
        lastIncrementalAt: new Date(),
        // Oggi ricalcolato col modello corrente: evita un doppio ricalcolo al riavvio.
        ...(day === this.romeToday()
          ? { modelVersion: MULTIGOL_MODEL_VERSION }
          : {}),
      });
      this.leagueScanCache.clear();
      this.logger.log(
        `Ricalcolo ${day} (modello v${MULTIGOL_MODEL_VERSION}): ${total} pick, ${leagues} competizioni in ${((Date.now() - started) / 1000).toFixed(0)}s`,
      );
    } finally {
      this.scanRunning = false;
      await this.store.setScanInProgress(false);
    }
    return { day, leagues, items: total, skipped: false };
  }

  /** Avvia il ricalcolo in background (non blocca la richiesta HTTP). */
  recalculateDayInBackground(day: string): void {
    void this.recalculateDay(day).catch((err) =>
      this.logger.error(`Ricalcolo ${day} fallito: ${String(err)}`),
    );
  }

  /**
   * Job notturno: calcola SEMPRE il giorno successivo. Se il server è rimasto spento,
   * recupera anche oggi (o i giorni mancanti dopo la fine della finestra).
   */
  async runNightlyRefresh(): Promise<void> {
    const state = await this.store.getState();
    if (!state || !(await this.store.hasAny())) {
      await this.refreshFullSnapshot();
      return;
    }
    const today = this.romeToday();
    const tomorrow = this.addDays(today, 1);
    const firstMissing = this.addDays(state.windowTo, 1);
    const days: string[] = [];
    for (
      let d = firstMissing > today ? firstMissing : today;
      d < tomorrow;
      d = this.addDays(d, 1)
    ) {
      days.push(d);
    }
    days.push(tomorrow);
    for (const day of days) {
      await this.recalculateDay(day);
    }
    await this.store.updateState({ modelVersion: MULTIGOL_MODEL_VERSION });
  }

  /**
   * Dopo un deploy con un nuovo modello le distribuzioni cambiano: ricalcola
   * automaticamente oggi (e i giorni successivi fino a MULTIGOL_RECALC_DAYS).
   */
  private async migrateModelVersion(): Promise<void> {
    try {
      if (!this.apiFootball.isConfigured()) {
        return;
      }
      const state = await this.store.getState();
      if (!state || (state.modelVersion ?? 1) >= MULTIGOL_MODEL_VERSION) {
        return;
      }
      const span = Math.max(
        1,
        Math.min(7, Math.floor(Number(this.config.get('MULTIGOL_RECALC_DAYS', 1)) || 1)),
      );
      this.logger.log(
        `Scout Multigol: modello v${state.modelVersion ?? 1} → v${MULTIGOL_MODEL_VERSION}, ricalcolo ${span} giorno/i da oggi.`,
      );
      let day = this.romeToday();
      for (let i = 0; i < span; i += 1) {
        const res = await this.recalculateDay(day);
        if (res.skipped) {
          return;
        }
        day = this.addDays(day, 1);
      }
      await this.store.updateState({ modelVersion: MULTIGOL_MODEL_VERSION });
    } catch (err) {
      this.logger.error(`Migrazione modello Scout fallita: ${String(err)}`);
    }
  }

  getApiFootballUsage() {
    return this.apiFootball.getUsage();
  }

  async getCompetitions(): Promise<ScoutCompetition[]> {
    if (
      this.scoutCompetitionsCache &&
      this.scoutCompetitionsCache.expiresAt > Date.now()
    ) {
      return this.scoutCompetitionsCache.items;
    }

    const items = await this.buildScoutCompetitions();

    this.scoutCompetitionsCache = {
      items,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    return items;
  }

  private scoutLeagueAllowList(): { all: boolean; tokens: Set<string> } {
    const raw = this.config.get<string>('MULTIGOL_SCOUT_LEAGUE_CODES')?.trim();
    if (raw === '*' || raw?.toUpperCase() === 'ALL') {
      return { all: true, tokens: new Set() };
    }
    const parts = (raw ? raw.split(',') : SCOUT_LEAGUE_CODES)
      .map((c) => c.trim())
      .filter(Boolean);
    const tokens = new Set(parts.map((p) => (/^\d+$/.test(p) ? p : p.toUpperCase())));
    return { all: false, tokens };
  }

  private needsApiLeagueCatalog(allow: { all: boolean; tokens: Set<string> }): boolean {
    if (allow.all) {
      return true;
    }
    for (const token of allow.tokens) {
      if (/^\d+$/.test(token)) {
        return true;
      }
      if (!(token in SCOUT_LEAGUE_META)) {
        return true;
      }
    }
    return false;
  }

  private competitionFromMeta(code: string): ScoutCompetition {
    const meta = SCOUT_LEAGUE_META[code];
    return {
      key: code,
      id: meta.apiLeagueId,
      code,
      name: meta.name,
      areaName: meta.areaName,
      areaCode: meta.areaCode,
    };
  }

  private async buildScoutCompetitions(): Promise<ScoutCompetition[]> {
    const allow = this.scoutLeagueAllowList();
    const fromMeta = Object.keys(SCOUT_LEAGUE_META).map((code) =>
      this.competitionFromMeta(code),
    );

    if (!this.needsApiLeagueCatalog(allow)) {
      return this.filterScoutCompetitions(fromMeta, allow).sort((a, b) =>
        this.compareScoutCompetitions(a, b),
      );
    }

    if (!this.apiFootball.isConfigured()) {
      return this.filterScoutCompetitions(fromMeta, allow).sort((a, b) =>
        this.compareScoutCompetitions(a, b),
      );
    }

    let catalog: ScoutCompetition[] = [];
    try {
      const raw = await this.apiFootball.listCurrentLeagues();
      catalog = raw.map((row) => {
        const id = row.league.id;
        const legacyCode = this.apiFootball.leagueCodeForApiId(id);
        return {
          key: legacyCode ?? String(id),
          id,
          code: legacyCode,
          name: row.league.name,
          areaName: row.country.name,
          areaCode: row.country.code?.trim().toUpperCase() ?? null,
        };
      });
    } catch (err) {
      this.logger.warn(
        `Catalogo leghe API-Football non disponibile: ${err instanceof Error ? err.message : err}`,
      );
      return this.filterScoutCompetitions(fromMeta, allow).sort((a, b) =>
        this.compareScoutCompetitions(a, b),
      );
    }

    const byId = new Map<number, ScoutCompetition>();
    for (const c of catalog) {
      byId.set(c.id, c);
    }
    for (const c of fromMeta) {
      byId.set(c.id, c);
    }
    const merged = [...byId.values()];
    return this.filterScoutCompetitions(merged, allow).sort((a, b) =>
      this.compareScoutCompetitions(a, b),
    );
  }

  private filterScoutCompetitions(
    items: ScoutCompetition[],
    allow: { all: boolean; tokens: Set<string> },
  ): ScoutCompetition[] {
    if (allow.all) {
      return items;
    }
    return items.filter((c) => {
      const code = c.code?.toUpperCase();
      const idKey = String(c.id);
      return (
        (code != null && allow.tokens.has(code)) || allow.tokens.has(idKey)
      );
    });
  }

  async listOpportunities(from?: string, to?: string): Promise<{
    from: string;
    to: string;
    leagues: string[];
    items: MultigolOpportunity[];
  }> {
    const snap = await this.getSnapshot();
    if (snap.items.length > 0 || !this.scanOnReadEnabled()) {
      return {
        from: snap.from,
        to: snap.to,
        leagues: snap.competitions.map((l) => l.name),
        items: snap.items,
      };
    }

    const range = this.dateRange(from, to);
    const items: MultigolOpportunity[] = [];
    const competitions = await this.getCompetitions();
    for (const league of competitions) {
      items.push(
        ...(await this.listLeagueOpportunities(league.key, range.from, range.to, {
          force: true,
        })),
      );
    }
    items.sort(
      (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
    );
    return {
      from: range.from,
      to: range.to,
      leagues: competitions.map((l) => l.name),
      items,
    };
  }

  async listLeagueOpportunities(
    leagueKey: string,
    from?: string,
    to?: string,
    options?: { force?: boolean },
  ): Promise<MultigolOpportunity[]> {
    const force = options?.force === true;
    const range = force
      ? this.dateRange(from, to)
      : await this.activeWindowRange(from, to);

    if (!force) {
      const persisted = await this.store.listByLeague(leagueKey);
      if (persisted.length > 0) {
        return persisted;
      }
      const cacheKey = `${leagueKey}:${range.from}:${range.to}`;
      const cached = this.leagueScanCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.items;
      }
      if (!this.scanOnReadEnabled()) {
        return [];
      }
    }

    const cacheKey = `${leagueKey}:${range.from}:${range.to}`;
    const cached = this.leagueScanCache.get(cacheKey);
    if (!force && cached && cached.expiresAt > Date.now()) {
      return cached.items;
    }

    const started = Date.now();
    const league = await this.resolveCompetition(leagueKey);
    if (!league) {
      return [];
    }

    const leagueCode = league.code ?? league.key;
    const listEmpirical = this.scoutListEmpiricalEnabled();
    const loadPickSideForm = listEmpirical || this.scoutXgEnabled();

    let fixtures: FdMatch[];
    try {
      fixtures = await this.apiFootball.scoutCompetitionFixtures(
        leagueCode,
        range.from,
        range.to,
      );
    } catch {
      return [];
    }
    const table = await this.apiFootball.scoutStandingsTable(
      leagueCode,
      range.from,
    );
    const teamFormCache = new Map<string, FdMatch[]>();
    const domesticTableCache = new Map<string, Map<number, FdStandingRow>>();

    const items: MultigolOpportunity[] = [];
    for (const match of fixtures) {
      this.apiFootball.rememberMatch(match);
      const season = this.resolveLeagueSeason(leagueCode, match.utcDate, match);
      const homeRow = await this.resolveStandingRowForScout(
        match.homeTeam.id,
        leagueCode,
        table.get(match.homeTeam.id),
        match.utcDate,
        season,
        domesticTableCache,
      );
      const awayRow = await this.resolveStandingRowForScout(
        match.awayTeam.id,
        leagueCode,
        table.get(match.awayTeam.id),
        match.utcDate,
        season,
        domesticTableCache,
      );

      const dossier = buildDossier({
        match,
        leagueCode,
        leagueName: league.name,
        homeRow,
        awayRow,
      });
      if (!dossier.pick) {
        continue;
      }

      let homeForm: FdMatch[] = [];
      let awayForm: FdMatch[] = [];
      if (loadPickSideForm) {
        const isHomePick = dossier.pick.outcomeLabel === OUTCOME_HOME_1_6;
        if (isHomePick) {
          homeForm = await this.loadTeamFormForScout(
            match.homeTeam.id,
            leagueCode,
            season,
            teamFormCache,
          );
        } else {
          awayForm = await this.loadTeamFormForScout(
            match.awayTeam.id,
            leagueCode,
            season,
            teamFormCache,
          );
        }
      }
      const xg = await this.resolvePickVenueXg(
        dossier.pick.outcomeLabel,
        match.homeTeam.id,
        match.awayTeam.id,
        leagueCode,
        season,
        homeForm,
        awayForm,
      );
      const modelCtx = await this.resolveModelContext({
        outcomeLabel: dossier.pick.outcomeLabel,
        homeTeamId: match.homeTeam.id,
        awayTeamId: match.awayTeam.id,
        leagueCode,
        season,
        fixtureId: match.id,
        leagueTable: table,
      });
      const pick = enrichPickWithEmpirical(
        {
          outcomeLabel: dossier.pick.outcomeLabel,
          probability: dossier.pick.probability,
          // λ stagionale da classifica: il modello v2 lo fonde con forma, xG e lega.
          lambdaSide: dossier.pick.lambdaSide,
        },
        match.homeTeam.id,
        match.awayTeam.id,
        loadPickSideForm ? homeForm : [],
        loadPickSideForm ? awayForm : [],
        dossier.pHome1to6,
        dossier.pAway1to6,
        xg.average,
        xg.samples,
        modelCtx,
      );
      const dossierWithEmpirical = { ...dossier, pick };

      this.matchSeeds.set(match.id, {
        match,
        leagueCode: league.key,
        leagueName: league.name,
        homeRow,
        awayRow,
      });

      items.push({
        matchId: dossier.matchId,
        leagueCode: dossier.leagueCode,
        leagueName: dossier.leagueName,
        areaName: league.areaName,
        areaCode: league.areaCode,
        utcDate: dossier.utcDate,
        matchday: dossier.matchday,
        roundLabel: dossier.roundLabel,
        eventName: dossier.eventName,
        homeTeam: dossier.homeTeam,
        awayTeam: dossier.awayTeam,
        outcomeLabel: pick.outcomeLabel,
        probabilityPercent:
          Math.round(pick.probability * 1000) / 10,
        empiricalProbabilityPercent:
          pick.empiricalProbability != null
            ? Math.round(pick.empiricalProbability * 1000) / 10
            : null,
        empiricalSampleHits: pick.empiricalHits,
        empiricalSampleMatches: pick.empiricalMatches,
        xgLambdaSide: pick.xgLambdaSide,
        xgSampleMatches: pick.xgSampleMatches,
        synthesisPercent: synthesisPercentFromPick(pick),
        marketPercent: pick.model?.market?.fairOverPercent ?? null,
        scoringRatePercent: pick.model?.scoring?.directPercent ?? null,
        modelVersion: MULTIGOL_MODEL_VERSION,
        teaser: deterministicExplanation(dossierWithEmpirical).slice(0, 280) + '…',
      });
    }

    this.leagueScanCache.set(cacheKey, {
      items,
      expiresAt: Date.now() + this.scoutCacheTtlMs(),
    });
    this.logger.log(
      `Scout ${league.code ?? leagueKey}: ${items.length} pick in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
    return items;
  }

  private scoutCacheTtlMs(): number {
    const h = this.config.get<number>('MULTIGOL_CACHE_HOURS', 12);
    return Math.max(1, h) * 60 * 60 * 1000;
  }

  private teamFormMatchLimit(): number {
    const n = this.config.get<number>('MULTIGOL_TEAM_FORM_LIMIT', DEFAULT_TEAM_FORM_MATCH_LIMIT);
    return Math.min(99, Math.max(1, Math.floor(Number(n) || DEFAULT_TEAM_FORM_MATCH_LIMIT)));
  }

  private h2hMatchLimit(): number {
    const n = this.config.get<number>('MULTIGOL_H2H_LIMIT', DEFAULT_H2H_MATCH_LIMIT);
    return Math.min(99, Math.max(1, Math.floor(Number(n) || DEFAULT_H2H_MATCH_LIMIT)));
  }

  private scoutListEmpiricalEnabled(): boolean {
    const raw = this.config.get<string>('MULTIGOL_SCOUT_LIST_EMPIRICAL')?.trim().toLowerCase();
    if (raw === '0' || raw === 'false' || raw === 'no') {
      return false;
    }
    return true;
  }

  /** xG nel dettaglio partita (forma + statistics). */
  private scoutXgEnabled(): boolean {
    const raw = this.config.get<string>('MULTIGOL_SCOUT_XG', 'true')
      ?.trim()
      .toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'no';
  }

  private async resolvePickVenueXg(
    outcomeLabel: string,
    homeTeamId: number,
    awayTeamId: number,
    leagueCode: string,
    season: number,
    homeForm: FdMatch[],
    awayForm: FdMatch[],
  ): Promise<{ average: number | null; samples: number }> {
    if (!this.scoutXgEnabled() || !this.apiFootball.isConfigured()) {
      return { average: null, samples: 0 };
    }
    const isHomePick = outcomeLabel === OUTCOME_HOME_1_6;
    const teamId = isHomePick ? homeTeamId : awayTeamId;
    const form = isHomePick ? homeForm : awayForm;
    const venue = isHomePick ? ('home' as const) : ('away' as const);
    let statsLeagueCode = leagueCode;
    if (isUefaCupLeagueCode(leagueCode)) {
      const domestic = await this.apiFootball.resolveDomesticLeagueCode(
        teamId,
        season,
      );
      if (domestic) {
        statsLeagueCode = domestic;
      }
    }
    return this.apiFootball.resolveTeamVenueExpectedGoals(
      teamId,
      statsLeagueCode,
      season,
      venue,
      form,
      8,
    );
  }

  private resolveLeagueSeason(
    leagueCode: string,
    utcDate: string,
    match?: FdMatch,
    seasonHint?: number | null,
  ): number {
    if (seasonHint != null && Number.isFinite(seasonHint)) {
      return seasonHint;
    }
    const fromFixture = match?.competition?.season;
    if (fromFixture != null && Number.isFinite(fromFixture)) {
      return fromFixture;
    }
    return this.apiFootball.seasonYearForKickoff(utcDate);
  }

  private mergeFormMatches(
    primary: FdMatch[],
    secondary: FdMatch[],
    limit: number,
  ): FdMatch[] {
    const byId = new Map<number, FdMatch>();
    for (const m of [...primary, ...secondary]) {
      byId.set(m.id, m);
    }
    return [...byId.values()]
      .sort(
        (a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime(),
      )
      .slice(0, limit);
  }

  private async loadTeamFormForScout(
    teamId: number,
    competitionLeagueCode: string,
    season: number,
    memoryCache?: Map<string, FdMatch[]>,
    skipApiCache = false,
  ): Promise<FdMatch[]> {
    const limit = this.teamFormMatchLimit();
    const cacheKey = `${competitionLeagueCode}:${season}:${teamId}`;
    if (!skipApiCache && memoryCache?.has(cacheKey)) {
      return memoryCache.get(cacheKey)!;
    }

    const cup = await this.apiFootball.scoutTeamLeagueFinished(
      teamId,
      competitionLeagueCode,
      season,
      limit,
      skipApiCache ? { skipCache: true } : undefined,
    );

    let merged = cup;
    if (isUefaCupLeagueCode(competitionLeagueCode)) {
      const domesticCode = await this.apiFootball.resolveDomesticLeagueCode(
        teamId,
        season,
      );
      if (domesticCode && domesticCode !== competitionLeagueCode) {
        const domestic = await this.apiFootball.scoutTeamLeagueFinished(
          teamId,
          domesticCode,
          season,
          limit,
          skipApiCache ? { skipCache: true } : undefined,
        );
        merged = this.mergeFormMatches(cup, domestic, limit);
      }
    }

    memoryCache?.set(cacheKey, merged);
    return merged;
  }

  private async resolveStandingRowForScout(
    teamId: number,
    competitionLeagueCode: string,
    cupRow: FdStandingRow | undefined,
    refDate: string,
    season: number,
    domesticTableCache: Map<string, Map<number, FdStandingRow>>,
  ): Promise<FdStandingRow | undefined> {
    if (!isUefaCupLeagueCode(competitionLeagueCode)) {
      return cupRow;
    }
    if (
      cupRow &&
      cupRow.playedGames >= SCOUT_UEFA_DOMESTIC_STANDING_MIN_GAMES
    ) {
      return cupRow;
    }

    const domesticCode = await this.apiFootball.resolveDomesticLeagueCode(
      teamId,
      season,
    );
    if (!domesticCode) {
      return cupRow;
    }

    const tableKey = `${domesticCode}:${season}`;
    let table = domesticTableCache.get(tableKey);
    if (!table) {
      table = await this.apiFootball.scoutStandingsTable(domesticCode, refDate);
      domesticTableCache.set(tableKey, table);
    }
    return table.get(teamId) ?? cupRow;
  }

  private async loadLeagueFormForTeam(
    teamId: number,
    leagueCode: string,
    utcDate: string,
    match?: FdMatch,
    skipCache = false,
    seasonHint?: number | null,
  ): Promise<FdMatch[]> {
    const season = this.resolveLeagueSeason(
      leagueCode,
      utcDate,
      match,
      seasonHint,
    );
    return this.loadTeamFormForScout(
      teamId,
      leagueCode,
      season,
      undefined,
      skipCache,
    );
  }

  async analyzeMatch(
    matchId: number,
    options?: { refresh?: boolean },
  ): Promise<MultigolAnalysis> {
    if (options?.refresh) {
      this.analysisCache.delete(matchId);
    }

    const cached = this.getAnalysisCache(matchId);
    if (cached) {
      const needsFormRefresh =
        Boolean(options?.refresh) ||
        !cached.stats.homeFormGoalsDetail?.length ||
        !cached.stats.awayFormGoalsDetail?.length;
      const withForm = needsFormRefresh
        ? await this.refreshFormOnDossier(cached, Boolean(options?.refresh))
        : cached;
      const withStanding = await this.ensureStandingDetails(withForm);
      const enriched = await this.attachInsights(
        await this.attachApiFootballStats(withStanding),
        Boolean(options?.refresh),
      );
      if (enriched !== cached) {
        this.setAnalysisCache(matchId, enriched);
      }
      return enriched;
    }

    const seed = this.matchSeeds.get(matchId);
    const match = seed?.match ?? (await this.apiFootball.scoutGetMatch(matchId));
    const lookupKey =
      seed?.leagueCode ??
      match.competition?.code ??
      (match.competition?.id != null ? String(match.competition.id) : null);
    const resolved = lookupKey
      ? await this.resolveCompetition(lookupKey)
      : null;
    const leagueKey =
      resolved?.key ??
      lookupKey ??
      match.competition?.code ??
      String(match.competition?.id ?? '');
    const leagueCode = resolved?.code ?? leagueKey;
    const leagueName =
      resolved?.name ??
      seed?.leagueName ??
      match.competition?.name ??
      leagueCode;

    const table =
      seed?.homeRow && seed?.awayRow
        ? new Map([
            [match.homeTeam.id, seed.homeRow],
            [match.awayTeam.id, seed.awayRow],
          ])
        : await this.apiFootball.scoutStandingsTable(leagueCode, match.utcDate);

    const homeRow = seed?.homeRow ?? table.get(match.homeTeam.id);
    const awayRow = seed?.awayRow ?? table.get(match.awayTeam.id);

    const h2hLimit = this.h2hMatchLimit();
    const [h2h, homeForm, awayForm] = await Promise.all([
      this.apiFootball.scoutHead2head(matchId, h2hLimit, match),
      this.loadLeagueFormForTeam(
        match.homeTeam.id,
        leagueCode,
        match.utcDate,
        match,
      ),
      this.loadLeagueFormForTeam(
        match.awayTeam.id,
        leagueCode,
        match.utcDate,
        match,
      ),
    ]);

    const dossier = buildDossier({
      match,
      leagueCode,
      leagueName,
      homeRow,
      awayRow,
      homeForm,
      awayForm,
      h2h,
    });

    const analysis = this.buildStructuredAnalysis(dossier);
    const deterministic = deterministicExplanation(dossier);

    const result: MultigolAnalysis = {
      ...dossier,
      areaName: resolved?.areaName ?? null,
      areaCode: resolved?.areaCode ?? null,
      analysis,
      explanation: deterministic,
      aiExplanation: null,
      aiEnabled: false,
      insights: null,
    };

    const withForm = options?.refresh
      ? await this.refreshFormOnDossier(result, true)
      : await this.applyFormAndXgToDossier(result, homeForm, awayForm);
    const withStanding = await this.ensureStandingDetails(withForm);
    const enriched = await this.attachInsights(
      await this.attachApiFootballStats(withStanding),
      Boolean(options?.refresh),
    );
    this.setAnalysisCache(matchId, enriched);
    return enriched;
  }

  /**
   * Dati extra mostrati nel dettaglio: scomposizione del modello, quote,
   * riposo e infortuni. Ricalcolati se il modello cambia versione.
   */
  private async attachInsights(
    dossier: MultigolAnalysis,
    force = false,
  ): Promise<MultigolAnalysis> {
    const breakdown = dossier.pick?.model ?? null;
    if (
      !force &&
      dossier.insights &&
      dossier.insights.modelVersion === MULTIGOL_MODEL_VERSION &&
      (dossier.insights.breakdown?.synthesisPercent ?? null) ===
        (breakdown?.synthesisPercent ?? null)
    ) {
      return dossier;
    }
    const injuries = await this.apiFootball
      .fixtureInjuries(dossier.matchId)
      .catch(() => null);
    const insights = buildInsights({
      breakdown,
      pickTeamName:
        dossier.pick?.outcomeLabel === OUTCOME_HOME_1_6
          ? dossier.homeTeam.name
          : dossier.pick?.outcomeLabel === OUTCOME_AWAY_1_6
            ? dossier.awayTeam.name
            : null,
      homeTeamId: dossier.homeTeam.id,
      awayTeamId: dossier.awayTeam.id,
      homeFormDates: (dossier.stats.homeFormGoalsDetail ?? []).map((e) => e.utcDate),
      awayFormDates: (dossier.stats.awayFormGoalsDetail ?? []).map((e) => e.utcDate),
      kickoffUtc: dossier.utcDate,
      injuries,
    });
    return { ...dossier, insights };
  }

  private async applyFormAndXgToDossier(
    dossier: MultigolAnalysis,
    homeForm: FdMatch[],
    awayForm: FdMatch[],
  ): Promise<MultigolAnalysis> {
    const seasonHint =
      dossier.stats.apiFootballHome?.season ??
      dossier.stats.apiFootballAway?.season ??
      null;
    const xg = dossier.pick
      ? await this.resolvePickVenueXg(
          dossier.pick.outcomeLabel,
          dossier.homeTeam.id,
          dossier.awayTeam.id,
          dossier.leagueCode,
          this.resolveLeagueSeason(
            dossier.leagueCode,
            dossier.utcDate,
            undefined,
            seasonHint,
          ),
          homeForm,
          awayForm,
        )
      : { average: null, samples: 0 };
    const modelCtx = await this.modelContextForDossier(dossier, seasonHint);
    return {
      ...dossier,
      ...patchFormStats(
        dossier,
        homeForm,
        awayForm,
        xg.average,
        xg.samples,
        modelCtx,
      ),
    };
  }

  /** Contesto del modello (quote, stats casa/trasferta, media lega) per il dettaglio. */
  private async modelContextForDossier(
    dossier: MultigolAnalysis,
    seasonHint: number | null,
  ): Promise<MultigolModelContext | null> {
    if (!dossier.pick) {
      return null;
    }
    const leagueTable = isUefaCupLeagueCode(dossier.leagueCode)
      ? null
      : await this.apiFootball
          .scoutStandingsTable(dossier.leagueCode, dossier.utcDate)
          .catch(() => null);
    return this.resolveModelContext({
      outcomeLabel: dossier.pick.outcomeLabel,
      homeTeamId: dossier.homeTeam.id,
      awayTeamId: dossier.awayTeam.id,
      leagueCode: dossier.leagueCode,
      season: this.resolveLeagueSeason(
        dossier.leagueCode,
        dossier.utcDate,
        undefined,
        seasonHint,
      ),
      fixtureId: dossier.matchId,
      leagueTable,
    });
  }

  private async resolveModelContext(input: {
    outcomeLabel: string;
    homeTeamId: number;
    awayTeamId: number;
    leagueCode: string;
    season: number;
    fixtureId: number;
    leagueTable?: Map<number, FdStandingRow> | null;
  }): Promise<MultigolModelContext | null> {
    if (!this.apiFootball.isConfigured()) {
      return null;
    }
    const isHomePick = input.outcomeLabel === OUTCOME_HOME_1_6;
    if (!isHomePick && input.outcomeLabel !== OUTCOME_AWAY_1_6) {
      return null;
    }
    const venue = isHomePick ? 'home' : 'away';
    const teamId = isHomePick ? input.homeTeamId : input.awayTeamId;
    const oppId = isHomePick ? input.awayTeamId : input.homeTeamId;
    const uefa = isUefaCupLeagueCode(input.leagueCode);
    try {
      const [teamSeason, oppSeason, market] = await Promise.all([
        this.resolveSeasonStatsForModel(teamId, input.leagueCode, input.season, uefa),
        this.resolveSeasonStatsForModel(oppId, input.leagueCode, input.season, uefa),
        this.apiFootball.fixtureTeamTotalMarket(input.fixtureId, venue),
      ]);
      const leagueAvg =
        !uefa && input.leagueTable
          ? averageGoalsPerTeamGame(input.leagueTable.values())
          : null;
      return {
        venue,
        teamSeason,
        oppSeason,
        leagueAvgGoalsPerTeamGame: leagueAvg,
        market,
      };
    } catch (err) {
      this.logger.debug(
        `Contesto modello non disponibile (match ${input.fixtureId}): ${String(err)}`,
      );
      return null;
    }
  }

  /** Stats stagionali API-Football; per le coppe UEFA usa il campionato domestico. */
  private async resolveSeasonStatsForModel(
    teamId: number,
    leagueCode: string,
    season: number,
    uefa: boolean,
  ): Promise<MultigolApiFootballSeasonStats | null> {
    let code: string | null = leagueCode;
    if (uefa) {
      code = await this.apiFootball.resolveDomesticLeagueCode(teamId, season);
    }
    if (!code) {
      return null;
    }
    const leagueId = this.apiFootball.leagueIdForCode(code);
    if (leagueId == null) {
      return null;
    }
    return this.apiFootball
      .getTeamSeasonStats(teamId, leagueId, season)
      .catch(() => null);
  }

  private async ensureStandingDetails(
    dossier: MultigolAnalysis,
  ): Promise<MultigolAnalysis> {
    const homeOk = dossier.stats.homeStandingDetail?.position != null;
    const awayOk = dossier.stats.awayStandingDetail?.position != null;
    if (homeOk && awayOk) {
      return dossier;
    }
    try {
      const table = await this.apiFootball.scoutStandingsTable(
        dossier.leagueCode,
        dossier.utcDate,
      );
      const season = this.resolveLeagueSeason(
        dossier.leagueCode,
        dossier.utcDate,
      );
      const domesticTableCache = new Map<string, Map<number, FdStandingRow>>();
      const homeRow = await this.resolveStandingRowForScout(
        dossier.homeTeam.id,
        dossier.leagueCode,
        table.get(dossier.homeTeam.id),
        dossier.utcDate,
        season,
        domesticTableCache,
      );
      const awayRow = await this.resolveStandingRowForScout(
        dossier.awayTeam.id,
        dossier.leagueCode,
        table.get(dossier.awayTeam.id),
        dossier.utcDate,
        season,
        domesticTableCache,
      );
      if (!homeRow && !awayRow) {
        return dossier;
      }
      return {
        ...dossier,
        ...patchStandingFromRows(dossier, homeRow, awayRow),
      };
    } catch (err) {
      this.logger.warn(
        `Classifica non recuperata per match ${dossier.matchId}: ${String(err)}`,
      );
      return dossier;
    }
  }

  private async refreshFormOnDossier(
    dossier: MultigolAnalysis,
    forceApi = false,
  ): Promise<MultigolAnalysis> {
    const formLimit = this.teamFormMatchLimit();
    const skipCache = forceApi;
    if (forceApi) {
      this.apiFootball.clearTeamFormCache(dossier.homeTeam.id, dossier.leagueCode);
      this.apiFootball.clearTeamFormCache(dossier.awayTeam.id, dossier.leagueCode);
    }
    const seasonHint =
      dossier.stats.apiFootballHome?.season ??
      dossier.stats.apiFootballAway?.season ??
      null;
    const [homeForm, awayForm] = await Promise.all([
      this.loadLeagueFormForTeam(
        dossier.homeTeam.id,
        dossier.leagueCode,
        dossier.utcDate,
        undefined,
        skipCache,
        seasonHint,
      ),
      this.loadLeagueFormForTeam(
        dossier.awayTeam.id,
        dossier.leagueCode,
        dossier.utcDate,
        undefined,
        skipCache,
        seasonHint,
      ),
    ]);
    const xg = dossier.pick
      ? await this.resolvePickVenueXg(
          dossier.pick.outcomeLabel,
          dossier.homeTeam.id,
          dossier.awayTeam.id,
          dossier.leagueCode,
          this.resolveLeagueSeason(
            dossier.leagueCode,
            dossier.utcDate,
            undefined,
            seasonHint,
          ),
          homeForm,
          awayForm,
        )
      : { average: null, samples: 0 };
    const modelCtx = await this.modelContextForDossier(dossier, seasonHint);
    const patched = patchFormStats(
      dossier,
      homeForm,
      awayForm,
      xg.average,
      xg.samples,
      modelCtx,
    );
    if (
      !patched.stats.homeFormGoalsDetail?.length &&
      !patched.stats.awayFormGoalsDetail?.length
    ) {
      this.logger.warn(
        `Forma gol vuota per match ${dossier.matchId} (home ${dossier.homeTeam.id}, away ${dossier.awayTeam.id})`,
      );
    }
    return { ...dossier, ...patched };
  }

  private async attachApiFootballStats(
    dossier: MultigolAnalysis,
  ): Promise<MultigolAnalysis> {
    if (
      dossier.stats.apiFootballHome !== undefined ||
      dossier.stats.apiFootballAway !== undefined
    ) {
      return dossier;
    }
    try {
      const extra = await this.apiFootball.loadMatchEnrichment({
        leagueCode: dossier.leagueCode,
        utcDate: dossier.utcDate,
        homeTeamName: dossier.homeTeam.name,
        awayTeamName: dossier.awayTeam.name,
        homeTeamId: dossier.homeTeam.id,
        awayTeamId: dossier.awayTeam.id,
        fixtureId: dossier.matchId,
      });
      return {
        ...dossier,
        stats: {
          ...dossier.stats,
          apiFootballHome: extra.home,
          apiFootballAway: extra.away,
          apiFootballFixture: extra.fixture,
        },
      };
    } catch (err) {
      this.logger.warn(`API-Football enrich: ${String(err)}`);
      return {
        ...dossier,
        stats: {
          ...dossier.stats,
          apiFootballHome: null,
          apiFootballAway: null,
          apiFootballFixture: null,
        },
      };
    }
  }

  private getAnalysisCache(matchId: number): MultigolAnalysis | null {
    const row = this.analysisCache.get(matchId);
    if (!row || row.expiresAt <= Date.now()) {
      this.analysisCache.delete(matchId);
      return null;
    }
    return row.value;
  }

  private setAnalysisCache(matchId: number, value: MultigolAnalysis): void {
    const hours = 6;
    this.analysisCache.set(matchId, {
      value,
      expiresAt: Date.now() + hours * 60 * 60 * 1000,
    });
  }

  private buildStructuredAnalysis(d: MatchDossier): string {
    if (!d.pick) {
      return 'Partita esclusa: probabilità multigol 1-6 sotto soglia.';
    }
    const lines = [
      `Esito selezionato: ${d.pick.outcomeLabel} (${(d.pick.probability * 100).toFixed(1)}% modello).`,
      `Gol attesi: ${d.homeTeam.name} ${d.lambdaHome.toFixed(2)} — ${d.awayTeam.name} ${d.lambdaAway.toFixed(2)}.`,
      `Probabilità fascia 1-6: casa ${(d.pHome1to6 * 100).toFixed(1)}%, ospite ${(d.pAway1to6 * 100).toFixed(1)}%.`,
      d.stats.homeStanding,
      d.stats.awayStanding,
      d.stats.homeFormGoals,
      d.stats.awayFormGoals,
      d.stats.h2hSummary,
    ];
    if (d.stats.homeBandRate != null) {
      lines.push(
        `Frequenza empirica multigol 1-6 casa (ultime gare in casa): ${Math.round(d.stats.homeBandRate * 100)}%.`,
      );
    }
    if (d.stats.awayBandRate != null) {
      lines.push(
        `Frequenza empirica multigol 1-6 ospite (ultime gare in trasferta): ${Math.round(d.stats.awayBandRate * 100)}%.`,
      );
    }
    return lines.join('\n\n');
  }

  private normalizeCompetitionKey(raw: string): string {
    const trimmed = raw.trim();
    return /^\d+$/.test(trimmed) ? trimmed : trimmed.toUpperCase();
  }

  private async resolveCompetition(
    rawKey: string,
  ): Promise<ScoutCompetition | null> {
    const key = this.normalizeCompetitionKey(rawKey);
    const list = await this.getCompetitions();
    return (
      list.find(
        (l) =>
          l.key === key ||
          l.key.toUpperCase() === key ||
          String(l.id) === key,
      ) ?? null
    );
  }

  private compareScoutCompetitions(
    a: ScoutCompetition,
    b: ScoutCompetition,
  ): number {
    const priority = (c: ScoutCompetition): number => {
      const code = c.code?.toUpperCase() ?? '';
      const idx = (SCOUT_LEAGUE_PRIORITY_CODES as readonly string[]).indexOf(
        code,
      );
      return idx === -1 ? 1000 : idx;
    };
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) {
      return pa - pb;
    }
    const area = (a.areaName ?? '').localeCompare(b.areaName ?? '', 'it');
    if (area !== 0) {
      return area;
    }
    return a.name.localeCompare(b.name, 'it');
  }

  private scanOnReadEnabled(): boolean {
    const raw = this.config
      .get<string>('MULTIGOL_SCOUT_SCAN_ON_READ', 'false')
      ?.trim()
      .toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  private fmtDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private addDays(isoDate: string, days: number): string {
    const d = new Date(`${isoDate}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return this.fmtDate(d);
  }

  private async activeWindowRange(
    from?: string,
    to?: string,
  ): Promise<{ from: string; to: string }> {
    const state = await this.store.getState();
    if (state?.windowFrom && state?.windowTo) {
      return { from: state.windowFrom, to: state.windowTo };
    }
    return this.dateRange(from, to);
  }

  private dateRange(from?: string, to?: string): { from: string; to: string } {
    const today = new Date();
    const start = from ? new Date(from) : today;
    const end = to
      ? new Date(to)
      : new Date(today.getTime() + 7 * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { from: fmt(today), to: fmt(new Date(today.getTime() + 7 * 86400000)) };
    }
    return start <= end
      ? { from: fmt(start), to: fmt(end) }
      : { from: fmt(end), to: fmt(start) };
  }
}
