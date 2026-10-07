import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  API_FOOTBALL_BASE,
  FD_CODE_TO_API_FOOTBALL_LEAGUE,
} from './api-football.constants';
import {
  apiFixtureToFdMatch,
  apiFixturesToH2h,
  apiStandingsToTable,
} from './api-football-scout.mapper';
import type {
  FdHead2HeadResponse,
  FdMatch,
  FdStandingRow,
} from './football-data.types';
import {
  mapFixtureStatistics,
  mapTeamSeasonStats,
} from './api-football.mapper';
import type {
  ApiFootballEnvelope,
  ApiFootballFixtureItem,
  ApiFootballFixtureStatRow,
  ApiFootballLeagueListItem,
  ApiFootballStatusResponse,
  ApiFootballTeamSearchItem,
  ApiFootballTeamStatistics,
  ApiFootballUsageSnapshot,
  MultigolApiFootballMatchStats,
  MultigolApiFootballSeasonStats,
} from './api-football.types';

const FETCH_TIMEOUT_MS = 60_000;
const DEFAULT_MIN_MS_BETWEEN_REQUESTS = 450;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
/** API-Football: con status=FT, last=100 restituisce 0 risultati (max 99). */
const API_FIXTURES_LAST_MAX = 99;

type CacheEntry<T> = { expiresAt: number; value: T };

@Injectable()
export class ApiFootballClient {
  private readonly logger = new Logger(ApiFootballClient.name);
  private sessionCalls = 0;
  private dailyCurrent: number | null = null;
  private dailyLimit: number | null = null;
  private lastStatusAt = 0;
  private lastRequestAt = 0;
  private rateLimitedUntil = 0;
  private lastRateLimitLogAt = 0;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly teamIdCache = new Map<string, number>();

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  getUsage(): ApiFootballUsageSnapshot {
    return {
      configured: this.isConfigured(),
      sessionCalls: this.sessionCalls,
      dailyCurrent: this.dailyCurrent,
      dailyLimit: this.dailyLimit,
    };
  }

  leagueIdForFdCode(code: string | null | undefined): number | null {
    if (!code) {
      return null;
    }
    return this.leagueIdForCode(code);
  }

  rememberMatch(match: FdMatch): void {
    this.set(`fdm:${match.id}`, match);
  }

  leagueIdForCode(code: string): number | null {
    const trimmed = code.trim();
    if (/^\d+$/.test(trimmed)) {
      const id = Number.parseInt(trimmed, 10);
      return Number.isFinite(id) ? id : null;
    }
    return FD_CODE_TO_API_FOOTBALL_LEAGUE[trimmed.toUpperCase()] ?? null;
  }

  /** Leghe con stagione corrente (catalogo API-Football, cache 24h lato service). */
  async listCurrentLeagues(): Promise<ApiFootballLeagueListItem[]> {
    this.requireConfigured();
    const cacheKey = 'catalog:leagues:current';
    const hit = this.get<ApiFootballLeagueListItem[]>(cacheKey);
    if (hit) {
      return hit;
    }

    const all: ApiFootballLeagueListItem[] = [];
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const body = await this.fetchEnvelope<ApiFootballLeagueListItem[]>(
        `/leagues?current=true&page=${page}`,
      );
      const chunk = body.response ?? [];
      all.push(...chunk);
      totalPages = body.paging?.total ?? 1;
      page += 1;
    }

    this.set(cacheKey, all, 24 * 60 * 60 * 1000);
    return all;
  }

  leagueCodeForApiId(leagueId: number): string | null {
    for (const [code, id] of Object.entries(FD_CODE_TO_API_FOOTBALL_LEAGUE)) {
      if (id === leagueId) {
        return code;
      }
    }
    return null;
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Scout Multigol: imposta API_FOOTBALL_KEY nel file .env.',
      );
    }
  }

  async scoutCompetitionFixtures(
    leagueCode: string,
    from: string,
    to: string,
  ): Promise<FdMatch[]> {
    this.requireConfigured();
    const leagueId = this.leagueIdForCode(leagueCode);
    if (leagueId == null) {
      return [];
    }
    const season = this.seasonYearForKickoff(from);
    const cacheKey = `scout:fx:${leagueCode}:${season}:${from}:${to}`;
    const hit = this.get<FdMatch[]>(cacheKey);
    if (hit) {
      return hit;
    }

    const raw = await this.fetchJson<ApiFootballFixtureItem[]>(
      `/fixtures?league=${leagueId}&season=${season}&from=${from}&to=${to}&status=NS-TBD-PST`,
    ).catch(() => [] as ApiFootballFixtureItem[]);

    const list = raw
      .map((f) => apiFixtureToFdMatch(f, leagueCode))
      .sort(
        (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
      );
    for (const m of list) {
      this.rememberMatch(m);
    }
    this.set(cacheKey, list);
    return list;
  }

  async scoutStandingsTable(
    leagueCode: string,
    refDate: string,
  ): Promise<Map<number, FdStandingRow>> {
    this.requireConfigured();
    const leagueId = this.leagueIdForCode(leagueCode);
    if (leagueId == null) {
      return new Map();
    }
    const season = this.seasonYearForKickoff(refDate);
    const cacheKey = `scout:st:${leagueCode}:${season}`;
    const hit = this.get<Map<number, FdStandingRow>>(cacheKey);
    if (hit) {
      return hit;
    }

    const raw = await this.fetchJson<unknown[]>(
      `/standings?league=${leagueId}&season=${season}`,
    ).catch(() => [] as unknown[]);

    const map = apiStandingsToTable(raw as Parameters<typeof apiStandingsToTable>[0]);
    this.set(cacheKey, map);
    return map;
  }

  async scoutGetMatch(id: number): Promise<FdMatch> {
    this.requireConfigured();
    const cacheKey = `fdm:${id}`;
    const hit = this.get<FdMatch>(cacheKey);
    if (hit) {
      return hit;
    }
    const raw = await this.fetchJson<ApiFootballFixtureItem[]>(
      `/fixtures?id=${id}`,
    );
    const f = raw[0];
    if (!f) {
      throw new ServiceUnavailableException('Partita non trovata.');
    }
    const leagueCode =
      this.leagueCodeForApiId(f.league.id) ?? String(f.league.id);
    const m = apiFixtureToFdMatch(f, leagueCode);
    this.rememberMatch(m);
    return m;
  }

  async scoutHead2head(
    fixtureId: number,
    limit = 8,
  ): Promise<FdHead2HeadResponse> {
    this.requireConfigured();
    const match = await this.scoutGetMatch(fixtureId);
    const cacheKey = `scout:h2h:${match.homeTeam.id}:${match.awayTeam.id}:${limit}`;
    const hit = this.get<FdHead2HeadResponse>(cacheKey);
    if (hit) {
      return hit;
    }
    const h2hParam = `${match.homeTeam.id}-${match.awayTeam.id}`;
    const raw = await this.fetchJson<ApiFootballFixtureItem[]>(
      `/fixtures/headtohead?h2h=${h2hParam}&last=${limit}`,
    ).catch(() => [] as ApiFootballFixtureItem[]);
    const data = apiFixturesToH2h(raw);
    this.set(cacheKey, data);
    return data;
  }

  clearTeamFormCache(teamId: number, leagueCode?: string): void {
    const prefix = leagueCode
      ? `scout:tf:${teamId}:L`
      : `scout:tf:${teamId}:`;
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /** Ultime gare finite **solo nel campionato** (lega + stagione API). */
  async scoutTeamLeagueFinished(
    teamId: number,
    leagueCode: string,
    season: number,
    limit = 99,
    options?: { skipCache?: boolean },
  ): Promise<FdMatch[]> {
    this.requireConfigured();
    const leagueId = this.leagueIdForCode(leagueCode);
    if (leagueId == null || !Number.isFinite(season)) {
      return [];
    }
    const cap = Math.min(API_FIXTURES_LAST_MAX, Math.max(1, limit));
    const cacheKey = `scout:tf:${teamId}:L${leagueId}:S${season}:${cap}`;
    if (options?.skipCache) {
      this.cache.delete(cacheKey);
    }
    const hit = this.get<FdMatch[]>(cacheKey);
    if (hit) {
      return hit;
    }
    const raw = await this.fetchJson<ApiFootballFixtureItem[]>(
      `/fixtures?team=${teamId}&league=${leagueId}&season=${season}&status=FT&last=${cap}`,
    ).catch(() => [] as ApiFootballFixtureItem[]);
    const list = raw
      .map((f) => apiFixtureToFdMatch(f, leagueCode))
      .sort(
        (a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime(),
      );
    if (list.length > 0) {
      this.set(cacheKey, list);
    } else {
      this.logger.warn(
        `API-Football: nessuna gara FT in lega ${leagueCode} s${season} team ${teamId}`,
      );
    }
    return list;
  }

  seasonYearForKickoff(utcDate: string): number {
    const d = new Date(utcDate);
    const month = d.getUTCMonth() + 1;
    const year = d.getUTCFullYear();
    return month >= 8 ? year : year - 1;
  }

  async refreshStatusIfStale(maxAgeMs = 60_000): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }
    if (Date.now() - this.lastStatusAt < maxAgeMs) {
      return;
    }
    try {
      const data = await this.fetchJson<ApiFootballStatusResponse>('/status');
      if (data?.requests) {
        this.dailyCurrent = data.requests.current ?? this.dailyCurrent;
        this.dailyLimit = data.requests.limit_day ?? this.dailyLimit;
      }
      this.lastStatusAt = Date.now();
    } catch (err) {
      this.logger.debug(`API-Football status: ${String(err)}`);
    }
  }

  async loadMatchEnrichment(input: {
    leagueCode: string;
    utcDate: string;
    homeTeamName: string;
    awayTeamName: string;
  }): Promise<{
    home: MultigolApiFootballSeasonStats | null;
    away: MultigolApiFootballSeasonStats | null;
    fixture: MultigolApiFootballMatchStats | null;
  }> {
    if (!this.isConfigured()) {
      return { home: null, away: null, fixture: null };
    }

    const leagueId = this.leagueIdForFdCode(input.leagueCode);
    if (leagueId == null) {
      return { home: null, away: null, fixture: null };
    }

    const season = this.seasonYearForKickoff(input.utcDate);
    await this.refreshStatusIfStale();

    const homeId = await this.resolveTeamId(
      input.homeTeamName,
      leagueId,
      season,
    );
    const awayId = await this.resolveTeamId(
      input.awayTeamName,
      leagueId,
      season,
    );

    const home = homeId
      ? await this.teamSeasonStats(homeId, leagueId, season)
      : null;
    const away = awayId
      ? await this.teamSeasonStats(awayId, leagueId, season)
      : null;

    let fixture: MultigolApiFootballMatchStats | null = null;
    if (homeId && awayId) {
      fixture = await this.fixtureStatisticsForMatch(
        homeId,
        awayId,
        input.utcDate,
        leagueId,
        season,
      );
    }

    await this.refreshStatusIfStale(0);
    return { home, away, fixture };
  }

  /**
   * Media xG segnati dalla squadra nelle ultime gare di forma, filtrate per venue.
   * Una chiamata /fixtures/statistics per partita (cache lunga).
   */
  /**
   * xG medio per venue: 1 chiamata /teams/statistics per squadra (cache), altrimenti
   * fino a maxFixtureStats gare di forma (cache per squadra+lega+stagione+venue).
   */
  async resolveTeamVenueExpectedGoals(
    teamId: number,
    leagueCode: string,
    season: number,
    venue: 'home' | 'away',
    formMatches: FdMatch[],
    maxFixtureStats = 8,
  ): Promise<{ average: number | null; samples: number }> {
    const leagueId = this.leagueIdForCode(leagueCode);
    if (leagueId == null || !this.isConfigured()) {
      return { average: null, samples: 0 };
    }

    const cacheKey = `scout:xgVenue:${teamId}:${leagueId}:${season}:${venue}`;
    const hit = this.get<{ average: number | null; samples: number }>(cacheKey);
    if (hit) {
      return hit;
    }

    const seasonStats = await this.getTeamSeasonStats(teamId, leagueId, season);
    const seasonAvg =
      venue === 'home'
        ? seasonStats?.avgExpectedGoalsForHome
        : seasonStats?.avgExpectedGoalsForAway;
    const seasonPlayed =
      venue === 'home' ? seasonStats?.playedHome : seasonStats?.playedAway;
    if (seasonAvg != null && seasonAvg > 0) {
      const out = {
        average: seasonAvg,
        samples: Math.max(seasonPlayed ?? 0, 8),
      };
      this.set(cacheKey, out);
      return out;
    }

    const fromForm = await this.averageVenueExpectedGoals(
      teamId,
      formMatches,
      venue,
      maxFixtureStats,
    );
    this.set(cacheKey, fromForm);
    return fromForm;
  }

  async getTeamSeasonStats(
    teamId: number,
    leagueId: number,
    season: number,
  ): Promise<MultigolApiFootballSeasonStats | null> {
    return this.teamSeasonStats(teamId, leagueId, season);
  }

  async averageVenueExpectedGoals(
    teamId: number,
    matches: FdMatch[],
    venue: 'home' | 'away',
    maxFixtures = 8,
  ): Promise<{ average: number | null; samples: number }> {
    if (!this.isConfigured() || !matches.length) {
      return { average: null, samples: 0 };
    }

    const filtered: FdMatch[] = [];
    for (const m of matches) {
      const isHome = m.homeTeam.id === teamId;
      const isAway = m.awayTeam.id === teamId;
      if (venue === 'home' && !isHome) {
        continue;
      }
      if (venue === 'away' && !isAway) {
        continue;
      }
      if (!isHome && !isAway) {
        continue;
      }
      filtered.push(m);
      if (filtered.length >= maxFixtures) {
        break;
      }
    }

    let sum = 0;
    let samples = 0;
    for (const m of filtered) {
      const xg = await this.teamExpectedGoalsInFixture(
        m.id,
        teamId,
        m.homeTeam.id,
        m.awayTeam.id,
      );
      if (xg != null && Number.isFinite(xg)) {
        sum += xg;
        samples += 1;
      }
    }

    return {
      average: samples > 0 ? sum / samples : null,
      samples,
    };
  }

  async teamExpectedGoalsInFixture(
    fixtureId: number,
    teamId: number,
    homeTeamId: number,
    awayTeamId: number,
  ): Promise<number | null> {
    const mapped = await this.fixtureStatisticsById(
      fixtureId,
      homeTeamId,
      awayTeamId,
    );
    if (!mapped) {
      return null;
    }
    const side =
      teamId === homeTeamId ? mapped.home : mapped.away;
    return side.expectedGoals;
  }

  async fixtureStatisticsById(
    fixtureId: number,
    homeTeamId: number,
    awayTeamId: number,
  ): Promise<MultigolApiFootballMatchStats | null> {
    const cacheKey = `fxstat:id:${fixtureId}`;
    const cached = this.get<MultigolApiFootballMatchStats | null>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const statRows = await this.fetchJson<ApiFootballFixtureStatRow[]>(
      `/fixtures/statistics?fixture=${fixtureId}`,
    ).catch(() => [] as ApiFootballFixtureStatRow[]);

    const mapped = mapFixtureStatistics(
      fixtureId,
      null,
      homeTeamId,
      awayTeamId,
      statRows,
    );
    this.set(cacheKey, mapped, 7 * 24 * 60 * 60 * 1000);
    return mapped;
  }

  private apiKey(): string | null {
    const k = this.config.get<string>('API_FOOTBALL_KEY')?.trim();
    return k || null;
  }

  private ttlMs(): number {
    const h = this.config.get<number>('MULTIGOL_CACHE_HOURS', 12);
    return Math.max(1, h) * 60 * 60 * 1000;
  }

  private get<T>(key: string): T | null {
    const e = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!e || e.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return e.value;
  }

  private set<T>(key: string, value: T, ttlOverrideMs?: number): void {
    const ttl = ttlOverrideMs ?? this.ttlMs();
    this.cache.set(key, { value, expiresAt: Date.now() + ttl });
  }

  private normalizeSearchName(name: string): string {
    return name
      .replace(/\b(FC|AC|SC|CF|SS|US|AS|SV|TSV|1\.)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async resolveTeamId(
    teamName: string,
    leagueId: number,
    season: number,
  ): Promise<number | null> {
    const cacheKey = `${leagueId}:${season}:${teamName.toLowerCase()}`;
    const hit = this.teamIdCache.get(cacheKey);
    if (hit) {
      return hit;
    }

    const q = this.normalizeSearchName(teamName) || teamName;
    const searchKey = `search:${q.toLowerCase()}`;
    let items =
      this.get<ApiFootballTeamSearchItem[]>(searchKey) ??
      (await this.fetchJson<ApiFootballTeamSearchItem[]>(
        `/teams?search=${encodeURIComponent(q)}`,
      ).catch(() => [] as ApiFootballTeamSearchItem[]));

    if (!this.get(searchKey)) {
      this.set(searchKey, items);
    }

    if (!items?.length) {
      items = await this.fetchJson<ApiFootballTeamSearchItem[]>(
        `/teams?search=${encodeURIComponent(teamName)}`,
      ).catch(() => []);
    }

    const candidates = items
      .map((i) => i.team?.id)
      .filter((id): id is number => typeof id === 'number');

    for (const id of candidates.slice(0, 6)) {
      const stats = await this.fetchJson<ApiFootballTeamStatistics | null>(
        `/teams/statistics?team=${id}&league=${leagueId}&season=${season}`,
      ).catch(() => null);
      if (stats?.fixtures?.played?.total != null) {
        this.teamIdCache.set(cacheKey, id);
        this.set(`ts:${id}:${leagueId}:${season}`, stats);
        return id;
      }
    }

    return null;
  }

  private async teamSeasonStats(
    teamId: number,
    leagueId: number,
    season: number,
  ): Promise<MultigolApiFootballSeasonStats | null> {
    const cacheKey = `mapped:ts:${teamId}:${leagueId}:${season}`;
    const cached = this.get<MultigolApiFootballSeasonStats>(cacheKey);
    if (cached) {
      return cached;
    }

    let raw = this.get<ApiFootballTeamStatistics>(
      `ts:${teamId}:${leagueId}:${season}`,
    );
    if (!raw) {
      raw = await this.fetchJson<ApiFootballTeamStatistics>(
        `/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`,
      ).catch(() => null);
      if (!raw) {
        return null;
      }
      this.set(`ts:${teamId}:${leagueId}:${season}`, raw);
    }

    const mapped = mapTeamSeasonStats(raw, season, leagueId);
    this.set(cacheKey, mapped);
    return mapped;
  }

  private kickoffDateOnly(utcDate: string): string {
    return utcDate.slice(0, 10);
  }

  private async fixtureStatisticsForMatch(
    homeId: number,
    awayId: number,
    utcDate: string,
    leagueId: number,
    season: number,
  ): Promise<MultigolApiFootballMatchStats | null> {
    const day = this.kickoffDateOnly(utcDate);
    const cacheKey = `fxstat:${leagueId}:${season}:${day}:${homeId}:${awayId}`;
    const hit = this.get<MultigolApiFootballMatchStats | null>(cacheKey);
    if (hit !== null) {
      return hit;
    }

    const fixtures = await this.fetchJson<ApiFootballFixtureItem[]>(
      `/fixtures?league=${leagueId}&season=${season}&from=${day}&to=${day}`,
    ).catch(() => [] as ApiFootballFixtureItem[]);

    const match = fixtures.find(
      (f) =>
        f.teams.home.id === homeId &&
        f.teams.away.id === awayId,
    );
    if (!match?.fixture?.id) {
      this.set(cacheKey, null);
      return null;
    }

    const venueParts = [
      match.fixture.venue?.name,
      match.fixture.venue?.city,
    ].filter(Boolean);
    const venue = venueParts.length ? venueParts.join(', ') : null;

    const statRows = await this.fetchJson<ApiFootballFixtureStatRow[]>(
      `/fixtures/statistics?fixture=${match.fixture.id}`,
    ).catch(() => [] as ApiFootballFixtureStatRow[]);

    const mapped = mapFixtureStatistics(
      match.fixture.id,
      venue,
      homeId,
      awayId,
      statRows,
    );
    this.set(cacheKey, mapped);
    return mapped;
  }

  private minMsBetweenRequests(): number {
    const raw = this.config.get<string | number>('API_FOOTBALL_MIN_MS', DEFAULT_MIN_MS_BETWEEN_REQUESTS);
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return DEFAULT_MIN_MS_BETWEEN_REQUESTS;
    }
    return Math.max(200, Math.min(10_000, Math.floor(n)));
  }

  private isRateLimitErrors(errs: unknown): boolean {
    if (errs == null || typeof errs !== 'object' || Array.isArray(errs)) {
      return false;
    }
    for (const value of Object.values(errs as Record<string, unknown>)) {
      if (
        typeof value === 'string' &&
        /too many requests|rate limit|per-minute/i.test(value)
      ) {
        return true;
      }
    }
    return false;
  }

  private logRateLimitOnce(message: string): void {
    const now = Date.now();
    if (now - this.lastRateLimitLogAt < 15_000) {
      return;
    }
    this.lastRateLimitLogAt = now;
    this.logger.warn(message);
  }

  private async throttle(): Promise<void> {
    const minGap = this.minMsBetweenRequests();
    const now = Date.now();
    if (now < this.rateLimitedUntil) {
      await new Promise((r) => setTimeout(r, this.rateLimitedUntil - now));
    }
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < minGap) {
      await new Promise((r) => setTimeout(r, minGap - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  private async fetchEnvelope<T>(
    path: string,
    attempt = 0,
  ): Promise<ApiFootballEnvelope<T>> {
    const key = this.apiKey();
    if (!key) {
      throw new Error('API_FOOTBALL_KEY non configurata');
    }

    await this.throttle();
    this.sessionCalls += 1;

    const url = path.startsWith('http')
      ? path
      : `${API_FOOTBALL_BASE}${path.startsWith('/') ? path : `/${path}`}`;

    const res = await fetch(url, {
      headers: {
        'x-apisports-key': key,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    const body = (await res.json()) as ApiFootballEnvelope<T>;
    const errs = body?.errors;
    const hasErrors = Array.isArray(errs)
      ? errs.length > 0
      : errs != null && typeof errs === 'object' && Object.keys(errs).length > 0;

    if (hasErrors && this.isRateLimitErrors(errs)) {
      const waitMs = Math.min(60_000, 4000 * 2 ** attempt);
      this.rateLimitedUntil = Date.now() + waitMs;
      this.logRateLimitOnce(
        `API-Football: limite richieste/minuto raggiunto, pausa ~${Math.round(waitMs / 1000)}s (retry ${attempt + 1}/${RATE_LIMIT_MAX_ATTEMPTS}).`,
      );
      if (attempt + 1 < RATE_LIMIT_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, waitMs));
        return this.fetchEnvelope(path, attempt + 1);
      }
      throw new Error('API-Football rate limit');
    }

    if (hasErrors) {
      this.logger.warn(`API-Football ${path}: ${JSON.stringify(errs)}`);
      throw new Error('API-Football errors');
    }
    if (!res.ok) {
      if (res.status === 429 && attempt + 1 < RATE_LIMIT_MAX_ATTEMPTS) {
        const waitMs = Math.min(60_000, 4000 * 2 ** attempt);
        this.rateLimitedUntil = Date.now() + waitMs;
        this.logRateLimitOnce(
          `API-Football HTTP 429: pausa ~${Math.round(waitMs / 1000)}s.`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
        return this.fetchEnvelope(path, attempt + 1);
      }
      throw new Error(`API-Football HTTP ${res.status}`);
    }
    return body;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const body = await this.fetchEnvelope<T>(path);
    return body.response as T;
  }
}
