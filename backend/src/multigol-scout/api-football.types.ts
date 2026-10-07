export type ApiFootballEnvelope<T> = {
  errors?: Record<string, string> | string[];
  response: T;
  paging?: { current: number; total: number };
};

export type ApiFootballLeagueListItem = {
  league: {
    id: number;
    name: string;
    type?: string;
    logo?: string;
  };
  country: {
    name: string;
    code: string | null;
  };
  seasons?: { year: number; current?: boolean }[];
};

export type ApiFootballStatusResponse = {
  account: { email?: string; plan?: string };
  requests: { current: number; limit_day: number };
};

export type ApiFootballTeamSearchItem = {
  team: { id: number; name: string; logo?: string };
};

export type ApiFootballTeamStatistics = {
  form?: string;
  fixtures?: {
    played?: { home?: number; away?: number; total?: number };
    wins?: { home?: number; away?: number; total?: number };
    draws?: { home?: number; away?: number; total?: number };
    loses?: { home?: number; away?: number; total?: number };
  };
  goals?: {
    for?: {
      average?: { home?: string; away?: string; total?: string };
    };
    against?: {
      average?: { home?: string; away?: string; total?: string };
    };
  };
  /** Presente su alcune leghe/piani API-Football */
  expected_goals?: {
    for?: {
      average?: { home?: string; away?: string; total?: string };
      total?: { home?: number; away?: number; total?: number };
    };
    against?: {
      average?: { home?: string; away?: string; total?: string };
    };
  };
  clean_sheet?: { home?: number; away?: number; total?: number };
  failed_to_score?: { home?: number; away?: number; total?: number };
  penalty?: {
    scored?: { total?: number };
    missed?: { total?: number };
  };
  lineups?: { formation?: string; played?: number }[];
  cards?: {
    yellow?: Record<string, { total?: number | null }>;
    red?: Record<string, { total?: number | null }>;
  };
};

export type ApiFootballFixtureItem = {
  fixture: {
    id: number;
    date: string;
    status?: { short?: string };
    venue?: { name?: string; city?: string };
  };
  goals: { home: number | null; away: number | null };
  score?: {
    fulltime?: { home: number | null; away: number | null };
  };
  league: { id: number; name: string; season: number; round?: string | null };
  teams: {
    home: { id: number; name: string; logo?: string };
    away: { id: number; name: string; logo?: string };
  };
};

export type ApiFootballFixtureStatRow = {
  team: { id: number; name: string };
  statistics: { type: string; value: number | string | null }[];
};

export type MultigolApiFootballSeasonStats = {
  form: string | null;
  played: number | null;
  wins: number | null;
  draws: number | null;
  loses: number | null;
  avgGoalsFor: number | null;
  avgGoalsAgainst: number | null;
  avgGoalsForHome: number | null;
  avgGoalsAgainstHome: number | null;
  avgGoalsForAway: number | null;
  avgGoalsAgainstAway: number | null;
  avgExpectedGoalsFor: number | null;
  avgExpectedGoalsForHome: number | null;
  avgExpectedGoalsForAway: number | null;
  playedHome: number | null;
  playedAway: number | null;
  cleanSheets: number | null;
  failedToScore: number | null;
  yellowCardsAvg: number | null;
  redCardsAvg: number | null;
  formation: string | null;
  penaltiesScored: number | null;
  penaltiesMissed: number | null;
  season: number | null;
  leagueId: number | null;
};

export type MultigolApiFootballMatchSideStats = {
  possessionPct: number | null;
  shotsTotal: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  fouls: number | null;
  yellowCards: number | null;
  redCards: number | null;
  expectedGoals: number | null;
};

export type MultigolApiFootballMatchStats = {
  fixtureId: number;
  home: MultigolApiFootballMatchSideStats;
  away: MultigolApiFootballMatchSideStats;
  venue: string | null;
};

export type ApiFootballUsageSnapshot = {
  configured: boolean;
  /** Chiamate effettuate da questo processo backend dall’avvio. */
  sessionCalls: number;
  /** Contatore giornaliero restituito da /status (se disponibile). */
  dailyCurrent: number | null;
  dailyLimit: number | null;
};
