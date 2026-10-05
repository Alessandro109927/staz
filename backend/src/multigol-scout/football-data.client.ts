import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  FdCompetition,
  FdCompetitionsResponse,
  FdHead2HeadResponse,
  FdMatch,
  FdMatchesResponse,
  FdStandingRow,
  FdStandingsResponse,
} from './football-data.types';

const BASE = 'https://api.football-data.org/v4';
const MAX_REQUESTS_PER_MINUTE = 9;

type CacheEntry<T> = { expiresAt: number; value: T };

@Injectable()
export class FootballDataClient {
  private readonly logger = new Logger(FootballDataClient.name);
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly requestTimestamps: number[] = [];
  private inFlight = 0;
  private readonly maxConcurrent = 2;

  constructor(private readonly config: ConfigService) {}

  private ttlMs(): number {
    const h = this.config.get<number>('MULTIGOL_CACHE_HOURS', 12);
    return Math.max(1, h) * 60 * 60 * 1000;
  }

  private key(): string {
    const k = this.config.get<string>('FOOTBALL_DATA_ORG_KEY')?.trim();
    if (!k) {
      throw new ServiceUnavailableException(
        'Scout Multigol non configurato: imposta FOOTBALL_DATA_ORG_KEY.',
      );
    }
    return k;
  }

  rememberMatch(match: FdMatch): void {
    this.set(`m:${match.id}`, match);
  }

  async listCompetitions(): Promise<FdCompetition[]> {
    const cacheKey = 'competitions:all';
    const hit = this.get<FdCompetition[]>(cacheKey);
    if (hit) {
      return hit;
    }
    const data = await this.schedule(() =>
      this.fetchJson<FdCompetitionsResponse>('/competitions'),
    );
    const list = data.competitions ?? [];
    this.set(cacheKey, list);
    return list;
  }

  async competitionFixtures(
    competitionKey: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<FdMatch[]> {
    const cacheKey = `fx:${competitionKey}:${dateFrom}:${dateTo}`;
    const hit = this.get<FdMatch[]>(cacheKey);
    if (hit) {
      return hit;
    }
    const q = new URLSearchParams({
      dateFrom,
      dateTo,
      status: 'SCHEDULED,TIMED',
    });
    const data = await this.schedule(() =>
      this.fetchJson<FdMatchesResponse>(
        `/competitions/${encodeURIComponent(competitionKey)}/matches?${q}`,
      ),
    );
    const list = (data.matches ?? []).sort(
      (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
    );
    for (const m of list) {
      this.rememberMatch(m);
    }
    this.set(cacheKey, list);
    return list;
  }

  async standingsTable(competitionKey: string): Promise<Map<number, FdStandingRow>> {
    const cacheKey = `st:${competitionKey}`;
    const hit = this.get<Map<number, FdStandingRow>>(cacheKey);
    if (hit) {
      return hit;
    }
    let data: FdStandingsResponse;
    try {
      data = await this.schedule(() =>
        this.fetchJson<FdStandingsResponse>(
          `/competitions/${encodeURIComponent(competitionKey)}/standings`,
        ),
      );
    } catch (err) {
      this.logger.debug(
        `Classifica assente per ${competitionKey}: ${String(err)}`,
      );
      const empty = new Map<number, FdStandingRow>();
      this.set(cacheKey, empty);
      return empty;
    }
    const table =
      data.standings?.find((s) => s.type === 'TOTAL')?.table ??
      data.standings?.[0]?.table ??
      [];
    const map = new Map<number, FdStandingRow>();
    for (const row of table) {
      map.set(row.team.id, row);
    }
    this.set(cacheKey, map);
    return map;
  }

  async getMatch(id: number): Promise<FdMatch> {
    const cacheKey = `m:${id}`;
    const hit = this.get<FdMatch>(cacheKey);
    if (hit) {
      return hit;
    }
    const m = await this.schedule(() => this.fetchJson<FdMatch>(`/matches/${id}`));
    this.set(cacheKey, m);
    return m;
  }

  async head2head(matchId: number, limit = 8): Promise<FdHead2HeadResponse> {
    const cacheKey = `h2h:${matchId}:${limit}`;
    const hit = this.get<FdHead2HeadResponse>(cacheKey);
    if (hit) {
      return hit;
    }
    const data = await this.schedule(() =>
      this.fetchJson<FdHead2HeadResponse>(
        `/matches/${matchId}/head2head?limit=${limit}`,
      ),
    );
    this.set(cacheKey, data);
    return data;
  }

  async teamFinished(teamId: number, limit = 10): Promise<FdMatch[]> {
    const cacheKey = `tf:${teamId}:${limit}`;
    const hit = this.get<FdMatch[]>(cacheKey);
    if (hit) {
      return hit;
    }
    const q = new URLSearchParams({ status: 'FINISHED', limit: String(limit) });
    const data = await this.schedule(() =>
      this.fetchJson<FdMatchesResponse>(`/teams/${teamId}/matches?${q}`),
    );
    const list = data.matches ?? [];
    this.set(cacheKey, list);
    return list;
  }

  private async schedule<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireSlot();
    try {
      return await fn();
    } finally {
      this.inFlight -= 1;
    }
  }

  private async acquireSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();
      while (
        this.requestTimestamps.length > 0 &&
        now - this.requestTimestamps[0] >= 60_000
      ) {
        this.requestTimestamps.shift();
      }
      if (
        this.inFlight < this.maxConcurrent &&
        this.requestTimestamps.length < MAX_REQUESTS_PER_MINUTE
      ) {
        this.inFlight += 1;
        this.requestTimestamps.push(now);
        return;
      }
      await this.sleep(400);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private get<T>(key: string): T | null {
    const e = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!e || e.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return e.value;
  }

  private set<T>(key: string, value: T): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs() });
  }

  private async fetchJson<T>(path: string, attempt = 0): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        headers: { 'X-Auth-Token': this.key(), Accept: 'application/json' },
      });
    } catch (err) {
      this.logger.warn(String(err));
      throw new ServiceUnavailableException('football-data.org non raggiungibile.');
    }

    if (res.status === 429) {
      if (attempt < 3) {
        const backoff = 8000 * (attempt + 1);
        this.logger.warn(`429 su ${path}, retry tra ${backoff}ms`);
        await this.sleep(backoff);
        // Retry inside schedule(): slot already acquired — do not call acquireSlot again.
        return this.fetchJson<T>(path, attempt + 1);
      }
      throw new ServiceUnavailableException(
        'Limite API football-data.org: attendi 1 minuto e riprova.',
      );
    }

    if (!res.ok) {
      throw new ServiceUnavailableException(
        `football-data.org errore ${res.status} su ${path}`,
      );
    }
    return (await res.json()) as T;
  }
}
