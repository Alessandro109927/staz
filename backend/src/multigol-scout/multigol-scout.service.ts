import { Injectable } from '@nestjs/common';
import type { FdMatch, FdStandingRow } from './football-data.types';
import { FootballDataClient } from './football-data.client';
import {
  buildDossier,
  deterministicExplanation,
  type MatchDossier,
} from './multigol-dossier.util';
import { MultigolNarrativeService } from './multigol-narrative.service';
import {
  SCOUT_LEAGUE_PRIORITY_CODES,
  type ScoutCompetition,
} from './multigol-scout.constants';

export type MultigolOpportunity = {
  matchId: number;
  leagueCode: string;
  leagueName: string;
  areaName: string | null;
  areaCode: string | null;
  utcDate: string;
  eventName: string;
  homeTeam: { id: number; name: string; crest: string | null };
  awayTeam: { id: number; name: string; crest: string | null };
  outcomeLabel: string;
  probabilityPercent: number;
  teaser: string;
};

export type MultigolAnalysis = MatchDossier & {
  areaName: string | null;
  areaCode: string | null;
  analysis: string;
  explanation: string;
  aiExplanation: string | null;
  aiEnabled: boolean;
};

type MatchSeed = {
  match: FdMatch;
  leagueCode: string;
  leagueName: string;
  homeRow?: FdStandingRow;
  awayRow?: FdStandingRow;
};

@Injectable()
export class MultigolScoutService {
  private readonly matchSeeds = new Map<number, MatchSeed>();
  private readonly analysisCache = new Map<
    number,
    { expiresAt: number; value: MultigolAnalysis }
  >();
  private scoutCompetitionsCache: {
    expiresAt: number;
    items: ScoutCompetition[];
  } | null = null;

  constructor(
    private readonly football: FootballDataClient,
    private readonly narrative: MultigolNarrativeService,
  ) {}

  async getCompetitions(): Promise<ScoutCompetition[]> {
    if (
      this.scoutCompetitionsCache &&
      this.scoutCompetitionsCache.expiresAt > Date.now()
    ) {
      return this.scoutCompetitionsCache.items;
    }

    const raw = await this.football.listCompetitions();
    const items = raw
      .filter((c) => c.type === 'LEAGUE')
      .map((c) => {
        const code = c.code?.trim() || null;
        return {
          key: code ?? String(c.id),
          id: c.id,
          code,
          name: c.name,
          areaName: c.area?.name?.trim() || null,
          areaCode: c.area?.code?.trim().toUpperCase() || null,
        };
      })
      .sort((a, b) => this.compareScoutCompetitions(a, b));

    this.scoutCompetitionsCache = {
      items,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    return items;
  }

  async listOpportunities(from?: string, to?: string): Promise<{
    from: string;
    to: string;
    leagues: string[];
    items: MultigolOpportunity[];
  }> {
    const range = this.dateRange(from, to);
    const items: MultigolOpportunity[] = [];

    const competitions = await this.getCompetitions();
    for (const league of competitions) {
      items.push(
        ...(await this.listLeagueOpportunities(league.key, range.from, range.to)),
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
  ): Promise<MultigolOpportunity[]> {
    const range = this.dateRange(from, to);
    const league = await this.resolveCompetition(leagueKey);
    if (!league) {
      return [];
    }

    const leagueCode = league.code ?? league.key;

    let fixtures: FdMatch[];
    try {
      fixtures = await this.football.competitionFixtures(
        league.key,
        range.from,
        range.to,
      );
    } catch {
      return [];
    }
    const table = await this.football.standingsTable(league.key);

    const items: MultigolOpportunity[] = [];
    for (const match of fixtures) {
      this.football.rememberMatch(match);
      const homeRow = table.get(match.homeTeam.id);
      const awayRow = table.get(match.awayTeam.id);

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
        eventName: dossier.eventName,
        homeTeam: dossier.homeTeam,
        awayTeam: dossier.awayTeam,
        outcomeLabel: dossier.pick.outcomeLabel,
        probabilityPercent: Math.round(dossier.pick.probability * 1000) / 10,
        teaser: deterministicExplanation(dossier).slice(0, 280) + '…',
      });
    }
    return items;
  }

  async analyzeMatch(matchId: number): Promise<MultigolAnalysis> {
    const cached = this.getAnalysisCache(matchId);
    if (cached) {
      return cached;
    }

    const seed = this.matchSeeds.get(matchId);
    const match = seed?.match ?? (await this.football.getMatch(matchId));
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
        : await this.football.standingsTable(leagueKey);

    const homeRow = seed?.homeRow ?? table.get(match.homeTeam.id);
    const awayRow = seed?.awayRow ?? table.get(match.awayTeam.id);

    const h2h = await this.football.head2head(matchId, 8);
    const homeForm = await this.football.teamFinished(match.homeTeam.id, 10);
    const awayForm = await this.football.teamFinished(match.awayTeam.id, 10);

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
    };

    this.setAnalysisCache(matchId, result);
    return result;
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
      list.find((l) => l.key === key || l.key.toUpperCase() === key) ?? null
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
