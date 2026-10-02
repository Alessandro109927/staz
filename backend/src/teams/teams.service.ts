import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  filterTeamsByKind,
  isLikelyNationalTeam,
  resolveNationalCountryCode,
  type TeamSearchKind,
} from './national-team.util';

export type TeamSearchResult = {
  id: number;
  name: string;
  logoUrl: string;
  countryCode: string | null;
};

type TeamSearchRow = TeamSearchResult & {
  countryName: string | null;
};

type CacheEntry = {
  expiresAt: number;
  items: TeamSearchResult[];
};

const BZZOIRO_BASE = 'https://sports.bzzoiro.com';
const CACHE_TTL_MS = 5 * 60 * 1000;
/** Bzzoiro `name` is a broad substring match; fetch more rows then rank locally. */
const BZZOIRO_FETCH_LIMIT = 50;

const YOUTH_OR_RESERVE_NAME =
  /\b(U\d{1,2}|Futuro|Primavera|Berretti|Giovanili)\b|(?:\bII\b|\bIII\b|\bB\s+Team\b)/i;

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: ConfigService) {}

  async searchTeams(
    query: string,
    limit = 12,
    kind: TeamSearchKind = 'all',
  ): Promise<TeamSearchResult[]> {
    const apiKey = this.config.get<string>('BZZOIRO_SPORTS_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Ricerca squadre non configurata: imposta BZZOIRO_SPORTS_API_KEY sul server.',
      );
    }

    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length < 2) {
      return [];
    }

    const cacheKey = `${normalizedQuery}:${limit}:${kind}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.items;
    }

    const rows = await this.fetchTeamRows(apiKey, query.trim(), kind);
    const filtered =
      kind === 'all' ? rows : filterTeamsByKind(rows, kind);
    const items = this.rankTeams(query.trim(), filtered)
      .slice(0, limit)
      .map(({ countryName: _countryName, ...team }) => team);

    this.cache.set(cacheKey, {
      items,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return items;
  }

  private async fetchTeamRows(
    apiKey: string,
    query: string,
    kind: TeamSearchKind,
  ): Promise<TeamSearchRow[]> {
    const byName = await this.fetchTeamsFromApi(apiKey, { name: query });

    if (kind === 'club') {
      return byName;
    }

    const countryCode = resolveNationalCountryCode(query);
    if (!countryCode) {
      return byName;
    }

    const byCountry = await this.fetchTeamsFromApi(apiKey, {
      country_code: countryCode,
    });

    if (kind === 'all') {
      const nationalsOnly = filterTeamsByKind(byCountry, 'national');
      return this.mergeTeamRows(byName, nationalsOnly);
    }

    return this.mergeTeamRows(byName, byCountry);
  }

  private mergeTeamRows(...lists: TeamSearchRow[][]): TeamSearchRow[] {
    const seen = new Set<number>();
    const out: TeamSearchRow[] = [];
    for (const list of lists) {
      for (const row of list) {
        if (seen.has(row.id)) {
          continue;
        }
        seen.add(row.id);
        out.push(row);
      }
    }
    return out;
  }

  private async fetchTeamsFromApi(
    apiKey: string,
    params: Record<string, string>,
  ): Promise<TeamSearchRow[]> {
    const url = new URL(`${BZZOIRO_BASE}/api/v2/teams/`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('limit', String(BZZOIRO_FETCH_LIMIT));

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Token ${apiKey}`,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      this.logger.warn(`Bzzoiro teams request failed: ${String(err)}`);
      throw new ServiceUnavailableException(
        'Impossibile contattare Bzzoiro Sports. Riprova tra poco.',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new ServiceUnavailableException(
        'Chiave API Bzzoiro non valida. Controlla BZZOIRO_SPORTS_API_KEY.',
      );
    }

    if (!response.ok) {
      this.logger.warn(`Bzzoiro teams HTTP ${response.status}`);
      throw new ServiceUnavailableException(
        'Ricerca squadre temporaneamente non disponibile.',
      );
    }

    const payload: unknown = await response.json();
    return this.mapTeams(payload);
  }

  private mapTeams(payload: unknown): TeamSearchRow[] {
    const rawList = this.extractTeamList(payload);
    const seen = new Set<number>();
    const items: TeamSearchRow[] = [];

    for (const raw of rawList) {
      if (!raw || typeof raw !== 'object') {
        continue;
      }
      const record = raw as Record<string, unknown>;
      const id = this.readNumber(record.id ?? record.pk);
      const name = this.readString(record.name ?? record.team_name ?? record.short_name);
      if (id == null || !name) {
        continue;
      }
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);

      const countryName =
        this.readString(record.country) ??
        this.readString((record.country as Record<string, unknown> | undefined)?.name);
      const countryCode =
        this.readString(record.country_code) ??
        this.readString((record.country as Record<string, unknown> | undefined)?.code) ??
        (countryName && countryName.length === 2 ? countryName : null);

      items.push({
        id,
        name,
        logoUrl: `${BZZOIRO_BASE}/img/team/${id}/?bg=transparent`,
        countryCode: countryCode ?? null,
        countryName: countryName ?? null,
      });
    }

    return items;
  }

  private rankTeams(query: string, teams: TeamSearchRow[]): TeamSearchRow[] {
    const q = query.toLowerCase();
    return [...teams].sort(
      (a, b) => this.teamRelevanceScore(q, b) - this.teamRelevanceScore(q, a),
    );
  }

  private teamRelevanceScore(queryLower: string, team: TeamSearchRow): number {
    const name = team.name.toLowerCase();
    const words = name.split(/\s+/);
    const firstWord = words[0] ?? '';
    let score = 0;

    if (name === queryLower) {
      score += 1000;
    }
    if (isLikelyNationalTeam(team.name, team.countryName)) {
      score += 200;
      if (name === queryLower || name.startsWith(queryLower)) {
        score += 400;
      }
    }
    if (firstWord === queryLower) {
      score += 650;
    }
    if (words.some((word) => word === queryLower)) {
      score += 450;
    }
    if (name.startsWith(queryLower)) {
      score += 350;
    }
    if (name.includes(queryLower)) {
      score += 120;
    }

    if (YOUTH_OR_RESERVE_NAME.test(team.name)) {
      score -= 600;
    }

    if (name.startsWith(queryLower) && team.name.length <= queryLower.length + 6) {
      score += 80;
    }

    if (queryLower.length <= 6 && team.name.length > queryLower.length + 20) {
      score -= 80;
    }

    const country = team.countryCode?.toLowerCase() ?? '';
    if (country === 'it' || country === 'italy') {
      score += 40;
    }

    return score;
  }

  private extractTeamList(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (!payload || typeof payload !== 'object') {
      return [];
    }
    const obj = payload as Record<string, unknown>;
    for (const key of ['results', 'data', 'teams', 'items']) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
    return [];
  }

  private readNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private readString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
