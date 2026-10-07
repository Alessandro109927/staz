import type {
  FdHead2HeadResponse,
  FdMatch,
  FdStandingRow,
} from './football-data.types';
import type { ApiFootballFixtureItem } from './api-football.types';

type ApiStandingBlock = {
  league?: {
    standings?: Array<
      Array<{
        rank: number;
        team: { id: number; name: string };
        points: number;
        all: {
          played: number;
          goals: { for: number; against: number };
        };
      }>
    >;
  };
};

function parseRound(round: string | undefined | null): {
  matchday: number | null;
  roundLabel: string | null;
} {
  const label = round?.trim() || null;
  if (!label) {
    return { matchday: null, roundLabel: null };
  }
  const trailing = label.match(/(?:-\s*|\s+)(\d+)\s*$/);
  if (trailing) {
    return { matchday: Number.parseInt(trailing[1], 10), roundLabel: label };
  }
  const only = Number.parseInt(label, 10);
  if (Number.isFinite(only) && String(only) === label) {
    return { matchday: only, roundLabel: label };
  }
  return { matchday: null, roundLabel: label };
}

export function apiFixtureToFdMatch(
  f: ApiFootballFixtureItem,
  leagueCode?: string,
): FdMatch {
  const { matchday, roundLabel } = parseRound(f.league.round);
  return {
    id: f.fixture.id,
    utcDate: f.fixture.date,
    status: f.fixture.status?.short ?? 'NS',
    matchday,
    roundLabel,
    homeTeam: {
      id: f.teams.home.id,
      name: f.teams.home.name,
      shortName: f.teams.home.name,
      crest: f.teams.home.logo,
    },
    awayTeam: {
      id: f.teams.away.id,
      name: f.teams.away.name,
      shortName: f.teams.away.name,
      crest: f.teams.away.logo,
    },
    score: {
      fullTime: {
        home: f.goals.home ?? f.score?.fulltime?.home ?? null,
        away: f.goals.away ?? f.score?.fulltime?.away ?? null,
      },
    },
    competition: {
      id: f.league.id,
      code: leagueCode,
      name: f.league.name,
      season: f.league.season,
    },
  };
}

export function apiStandingsToTable(
  blocks: ApiStandingBlock[],
): Map<number, FdStandingRow> {
  const map = new Map<number, FdStandingRow>();
  const table = blocks[0]?.league?.standings?.[0] ?? [];
  for (const row of table) {
    map.set(row.team.id, {
      position: row.rank,
      team: { id: row.team.id, name: row.team.name, shortName: row.team.name },
      playedGames: row.all.played,
      points: row.points,
      goalsFor: row.all.goals.for,
      goalsAgainst: row.all.goals.against,
    });
  }
  return map;
}

export function apiFixturesToH2h(
  fixtures: ApiFootballFixtureItem[],
): FdHead2HeadResponse {
  const matches = fixtures.map((f) => apiFixtureToFdMatch(f));
  let totalGoals = 0;
  for (const m of matches) {
    const h = m.score.fullTime.home;
    const a = m.score.fullTime.away;
    if (h != null && a != null) {
      totalGoals += h + a;
    }
  }
  return {
    aggregates: {
      numberOfMatches: matches.length,
      totalGoals,
    },
    matches,
  };
}
