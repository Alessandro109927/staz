/** Codici lega scout → API-Football league id */
export const FD_CODE_TO_API_FOOTBALL_LEAGUE: Record<string, number> = {
  PL: 39,
  ELC: 40,
  EL1: 41,
  EL2: 42,
  FL1: 61,
  FL2: 62,
  BL1: 78,
  BL2: 79,
  DED: 88,
  DJ1: 89,
  PPL: 94,
  PT2: 95,
  EK: 106,
  NO1: 103,
  SE1: 113,
  DK1: 119,
  SA: 135,
  SB: 136,
  BE1: 144,
  PD: 140,
  SD: 141,
  SC1: 179,
  GR1: 197,
  TR1: 203,
  TR2: 204,
  CH1: 207,
  HR1: 210,
  AT1: 218,
  RO1: 283,
  RS1: 286,
  CZ1: 345,
  FI1: 244,
  BSA: 71,
  MLS: 253,
  SAU: 307,
};

type LeagueMeta = {
  apiLeagueId: number;
  name: string;
  areaName: string;
  areaCode: string;
};

function meta(
  apiLeagueId: number,
  name: string,
  areaName: string,
  areaCode: string,
): LeagueMeta {
  return { apiLeagueId, name, areaName, areaCode };
}

/** Metadati campionati scout (nome e paese in UI). */
export const SCOUT_LEAGUE_META: Record<string, LeagueMeta> = {
  PL: meta(39, 'Premier League', 'England', 'GB'),
  ELC: meta(40, 'Championship', 'England', 'GB'),
  EL1: meta(41, 'League One', 'England', 'GB'),
  EL2: meta(42, 'League Two', 'England', 'GB'),
  FL1: meta(61, 'Ligue 1', 'France', 'FR'),
  FL2: meta(62, 'Ligue 2', 'France', 'FR'),
  BL1: meta(78, 'Bundesliga', 'Germany', 'DE'),
  BL2: meta(79, '2. Bundesliga', 'Germany', 'DE'),
  DED: meta(88, 'Eredivisie', 'Netherlands', 'NL'),
  DJ1: meta(89, 'Eerste Divisie', 'Netherlands', 'NL'),
  PPL: meta(94, 'Primeira Liga', 'Portugal', 'PT'),
  PT2: meta(95, 'Liga Portugal 2', 'Portugal', 'PT'),
  EK: meta(106, 'Ekstraklasa', 'Poland', 'PL'),
  NO1: meta(103, 'Eliteserien', 'Norway', 'NO'),
  SE1: meta(113, 'Allsvenskan', 'Sweden', 'SE'),
  DK1: meta(119, 'Superliga', 'Denmark', 'DK'),
  SA: meta(135, 'Serie A', 'Italy', 'IT'),
  SB: meta(136, 'Serie B', 'Italy', 'IT'),
  BE1: meta(144, 'Pro League', 'Belgium', 'BE'),
  PD: meta(140, 'La Liga', 'Spain', 'ES'),
  SD: meta(141, 'La Liga 2', 'Spain', 'ES'),
  SC1: meta(179, 'Premiership', 'Scotland', 'GB'),
  GR1: meta(197, 'Super League 1', 'Greece', 'GR'),
  TR1: meta(203, 'Süper Lig', 'Turkey', 'TR'),
  TR2: meta(204, '1. Lig', 'Turkey', 'TR'),
  CH1: meta(207, 'Super League', 'Switzerland', 'CH'),
  HR1: meta(210, 'HNL', 'Croatia', 'HR'),
  AT1: meta(218, 'Bundesliga', 'Austria', 'AT'),
  RO1: meta(283, 'Liga I', 'Romania', 'RO'),
  RS1: meta(286, 'Super Liga', 'Serbia', 'RS'),
  CZ1: meta(345, 'Czech Liga', 'Czech Republic', 'CZ'),
  FI1: meta(244, 'Veikkausliiga', 'Finland', 'FI'),
  BSA: meta(71, 'Campeonato Brasileiro Série A', 'Brazil', 'BR'),
  MLS: meta(253, 'Major League Soccer', 'USA', 'US'),
  SAU: meta(307, 'Pro League', 'Saudi Arabia', 'SA'),
};

const BASE = 'https://v3.football.api-sports.io';

export const API_FOOTBALL_BASE = BASE;
