export type FdTeamRef = {
  id: number;
  name: string;
  shortName?: string;
  crest?: string;
};

export type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  homeTeam: FdTeamRef;
  awayTeam: FdTeamRef;
  score: {
    fullTime: { home: number | null; away: number | null };
  };
  competition?: { id?: number; code?: string; name: string };
};

export type FdMatchesResponse = { matches: FdMatch[] };

export type FdCompetition = {
  id: number;
  name: string;
  code: string | null;
  type: string;
  area?: { name?: string; code?: string };
  currentSeason?: { startDate?: string; endDate?: string };
};

export type FdCompetitionsResponse = {
  competitions: FdCompetition[];
};

export type FdStandingRow = {
  position: number;
  team: { id: number; name: string; shortName?: string };
  playedGames: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
};

export type FdStandingsResponse = {
  standings: Array<{ type: string; table: FdStandingRow[] }>;
};

export type FdHead2HeadResponse = {
  aggregates: {
    numberOfMatches: number;
    totalGoals: number;
  };
  matches: FdMatch[];
};
