import type {
  ApiFootballFixtureStatRow,
  ApiFootballTeamStatistics,
  MultigolApiFootballMatchSideStats,
  MultigolApiFootballMatchStats,
  MultigolApiFootballSeasonStats,
} from './api-football.types';

function parseAvg(v: string | undefined): number | null {
  if (v == null || v === '') {
    return null;
  }
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function avgFromTotal(
  total: number | null | undefined,
  played: number | null | undefined,
): number | null {
  if (total == null || played == null || played <= 0) {
    return null;
  }
  if (!Number.isFinite(total)) {
    return null;
  }
  return total / played;
}

function cardTotal(
  bucket: Record<string, { total?: number | null }> | undefined,
): number | null {
  if (!bucket) {
    return null;
  }
  let sum = 0;
  let any = false;
  for (const row of Object.values(bucket)) {
    const t = row?.total;
    if (typeof t === 'number' && Number.isFinite(t)) {
      sum += t;
      any = true;
    }
  }
  return any ? sum : null;
}

export function mapTeamSeasonStats(
  raw: ApiFootballTeamStatistics,
  season: number,
  leagueId: number,
): MultigolApiFootballSeasonStats {
  const played = raw.fixtures?.played?.total ?? null;
  const playedHome = raw.fixtures?.played?.home ?? null;
  const playedAway = raw.fixtures?.played?.away ?? null;
  const xgFor = raw.expected_goals?.for;
  const yellowTotal = cardTotal(raw.cards?.yellow);
  const redTotal = cardTotal(raw.cards?.red);
  const formation =
    raw.lineups?.slice().sort((a, b) => (b.played ?? 0) - (a.played ?? 0))[0]
      ?.formation ?? null;

  return {
    form: raw.form?.trim() || null,
    played,
    wins: raw.fixtures?.wins?.total ?? null,
    draws: raw.fixtures?.draws?.total ?? null,
    loses: raw.fixtures?.loses?.total ?? null,
    avgGoalsFor: parseAvg(raw.goals?.for?.average?.total),
    avgGoalsAgainst: parseAvg(raw.goals?.against?.average?.total),
    avgGoalsForHome: parseAvg(raw.goals?.for?.average?.home),
    avgGoalsAgainstHome: parseAvg(raw.goals?.against?.average?.home),
    avgGoalsForAway: parseAvg(raw.goals?.for?.average?.away),
    avgGoalsAgainstAway: parseAvg(raw.goals?.against?.average?.away),
    avgExpectedGoalsFor:
      parseAvg(xgFor?.average?.total) ??
      avgFromTotal(xgFor?.total?.total ?? null, played),
    avgExpectedGoalsForHome:
      parseAvg(xgFor?.average?.home) ??
      avgFromTotal(xgFor?.total?.home ?? null, playedHome),
    avgExpectedGoalsForAway:
      parseAvg(xgFor?.average?.away) ??
      avgFromTotal(xgFor?.total?.away ?? null, playedAway),
    playedHome,
    playedAway,
    cleanSheets: raw.clean_sheet?.total ?? null,
    failedToScore: raw.failed_to_score?.total ?? null,
    yellowCardsAvg:
      played && played > 0 && yellowTotal != null
        ? Math.round((yellowTotal / played) * 10) / 10
        : null,
    redCardsAvg:
      played && played > 0 && redTotal != null
        ? Math.round((redTotal / played) * 10) / 10
        : null,
    formation,
    penaltiesScored: raw.penalty?.scored?.total ?? null,
    penaltiesMissed: raw.penalty?.missed?.total ?? null,
    season,
    leagueId,
  };
}

function statValue(
  rows: { type: string; value: number | string | null }[],
  ...labels: string[]
): number | null {
  const lower = labels.map((l) => l.toLowerCase());
  for (const row of rows) {
    const t = row.type?.toLowerCase() ?? '';
    if (!lower.some((l) => t.includes(l))) {
      continue;
    }
    const v = row.value;
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v;
    }
    if (typeof v === 'string') {
      const pct = v.replace('%', '').trim();
      const n = Number.parseFloat(pct);
      if (Number.isFinite(n)) {
        return n;
      }
    }
  }
  return null;
}

function mapSideStats(
  rows: { type: string; value: number | string | null }[],
): MultigolApiFootballMatchSideStats {
  return {
    possessionPct: statValue(rows, 'ball possession', 'possession'),
    shotsTotal: statValue(rows, 'total shots'),
    shotsOnTarget: statValue(rows, 'shots on goal', 'on target'),
    corners: statValue(rows, 'corner'),
    fouls: statValue(rows, 'fouls'),
    yellowCards: statValue(rows, 'yellow card'),
    redCards: statValue(rows, 'red card'),
    expectedGoals: statValue(rows, 'expected goals', 'xg'),
  };
}

export function mapFixtureStatistics(
  fixtureId: number,
  venue: string | null,
  homeTeamId: number,
  awayTeamId: number,
  rows: ApiFootballFixtureStatRow[],
): MultigolApiFootballMatchStats | null {
  const homeRow = rows.find((r) => r.team.id === homeTeamId);
  const awayRow = rows.find((r) => r.team.id === awayTeamId);
  if (!homeRow?.statistics?.length || !awayRow?.statistics?.length) {
    return null;
  }
  return {
    fixtureId,
    venue,
    home: mapSideStats(homeRow.statistics),
    away: mapSideStats(awayRow.statistics),
  };
}
