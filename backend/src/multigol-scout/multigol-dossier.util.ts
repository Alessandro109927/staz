import type { FdHead2HeadResponse, FdMatch, FdStandingRow } from './football-data.types';
import {
  estimateLambdasFromSeason,
  probabilityGoalsBetween,
} from './multigol.poisson';
import {
  MIN_BAND_PROBABILITY,
  MIN_LAMBDA_SIDE,
  OUTCOME_AWAY_1_6,
  OUTCOME_HOME_1_6,
} from './multigol-scout.constants';

export type MultigolPick = {
  outcomeLabel: typeof OUTCOME_HOME_1_6 | typeof OUTCOME_AWAY_1_6;
  probability: number;
  lambdaSide: number;
};

export type StandingSnapshot = {
  position: number | null;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  playedGames: number;
};

export type VenueStatSlice = {
  standingDetail: StandingSnapshot | null;
  lambda: number;
  pMultigol1to6: number;
  /** Quota 1–6 su ultime gare; null se meno di 3 partite nel campione (soglia statistica). */
  bandRate: number | null;
  bandHits: number;
  bandMatches: number;
};

export type TeamVenueStats = {
  all: VenueStatSlice;
  home: VenueStatSlice;
  away: VenueStatSlice;
};

export type H2hMatchEntry = {
  matchId: number;
  utcDate: string;
  homeTeamName: string;
  homeTeamCrest: string;
  awayTeamName: string;
  awayTeamCrest: string;
  scoreHome: number;
  scoreAway: number;
  /** Squadra casa della partita in analisi giocava in casa in questo H2H. */
  fixtureHomeAtHome: boolean;
};

export type FormGoalEntry = {
  matchId: number;
  opponentId: number;
  opponentName: string;
  opponentCrest: string;
  goalsScored: number;
  goalsConceded: number;
  venue: 'home' | 'away';
  utcDate: string;
};

export type MatchDossier = {
  matchId: number;
  leagueCode: string;
  leagueName: string;
  utcDate: string;
  eventName: string;
  homeTeam: { id: number; name: string; crest: string | null };
  awayTeam: { id: number; name: string; crest: string | null };
  lambdaHome: number;
  lambdaAway: number;
  pHome1to6: number;
  pAway1to6: number;
  pick: MultigolPick | null;
  stats: {
    homeStanding: string;
    awayStanding: string;
    homeStandingDetail: StandingSnapshot | null;
    awayStandingDetail: StandingSnapshot | null;
    homeFormGoals: string;
    awayFormGoals: string;
    homeFormGoalsDetail: FormGoalEntry[];
    awayFormGoalsDetail: FormGoalEntry[];
    h2hSummary: string;
    h2hMatchesDetail: H2hMatchEntry[];
    h2hMultigolHomePct: number | null;
    h2hMultigolAwayPct: number | null;
    homeBandRate: number | null;
    awayBandRate: number | null;
    homeVenueStats: TeamVenueStats;
    awayVenueStats: TeamVenueStats;
  };
};

function teamName(t: { shortName?: string; name: string }): string {
  return t.shortName?.trim() || t.name;
}

function teamCrestUrl(team: { id: number; crest?: string }): string {
  const url = team.crest?.trim();
  if (url) {
    return url;
  }
  return `https://crests.football-data.org/${team.id}.png`;
}

function seasonRates(row: FdStandingRow | undefined): { att: number; def: number } {
  if (!row || row.playedGames <= 0) {
    return { att: 1.2, def: 1.2 };
  }
  return {
    att: row.goalsFor / row.playedGames,
    def: row.goalsAgainst / row.playedGames,
  };
}

function bandCount(
  teamId: number,
  matches: FdMatch[],
  venue?: 'home' | 'away',
): { hits: number; matches: number } {
  let hits = 0;
  let n = 0;
  for (const m of matches) {
    const h = m.score?.fullTime?.home;
    const a = m.score?.fullTime?.away;
    if (h == null || a == null) {
      continue;
    }
    const isHome = m.homeTeam.id === teamId;
    const isAway = m.awayTeam.id === teamId;
    if (venue === 'home' && !isHome) {
      continue;
    }
    if (venue === 'away' && !isAway) {
      continue;
    }
    if (!venue && !isHome && !isAway) {
      continue;
    }
    const gf = isHome ? h : a;
    n += 1;
    if (gf >= 1 && gf <= 6) {
      hits += 1;
    }
  }
  return { hits, matches: n };
}

function bandRate(teamId: number, matches: FdMatch[], venue?: 'home' | 'away'): number | null {
  const { hits, matches: n } = bandCount(teamId, matches, venue);
  return n >= 3 ? hits / n : null;
}

function bandSliceFields(
  teamId: number,
  matches: FdMatch[],
  venue?: 'home' | 'away',
): Pick<VenueStatSlice, 'bandRate' | 'bandHits' | 'bandMatches'> {
  const { hits, matches: n } = bandCount(teamId, matches, venue);
  return {
    bandHits: hits,
    bandMatches: n,
    bandRate: n >= 3 ? hits / n : null,
  };
}

function formGoalsEntries(teamId: number, matches: FdMatch[], max = 6): FormGoalEntry[] {
  const sorted = [...matches].sort(
    (a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime(),
  );
  const out: FormGoalEntry[] = [];
  for (const m of sorted) {
    if (out.length >= max) {
      break;
    }
    const h = m.score?.fullTime?.home;
    const a = m.score?.fullTime?.away;
    if (h == null || a == null) {
      continue;
    }
    const isHome = m.homeTeam.id === teamId;
    const isAway = m.awayTeam.id === teamId;
    if (!isHome && !isAway) {
      continue;
    }
    const opponent = isHome ? m.awayTeam : m.homeTeam;
    out.push({
      matchId: m.id,
      opponentId: opponent.id,
      opponentName: teamName(opponent),
      opponentCrest: teamCrestUrl(opponent),
      goalsScored: isHome ? h : a,
      goalsConceded: isHome ? a : h,
      venue: isHome ? 'home' : 'away',
      utcDate: m.utcDate,
    });
  }
  return out;
}

function formGoalsLine(teamId: number, matches: FdMatch[], label: string): string {
  const entries = formGoalsEntries(teamId, matches, 6);
  if (!entries.length) {
    return `${label}: nessun dato recente.`;
  }
  const parts = entries.map((e) => String(e.goalsScored));
  return `${label}: gol segnati nelle ultime uscite [${parts.join(', ')}].`;
}

function aggregateStandingFromMatches(
  teamId: number,
  matches: FdMatch[],
  venue: 'home' | 'away',
): StandingSnapshot | null {
  let playedGames = 0;
  let points = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (const m of matches) {
    const h = m.score?.fullTime?.home;
    const a = m.score?.fullTime?.away;
    if (h == null || a == null) {
      continue;
    }
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
    const gf = isHome ? h : a;
    const ga = isHome ? a : h;
    playedGames += 1;
    goalsFor += gf;
    goalsAgainst += ga;
    if (gf > ga) {
      points += 3;
    } else if (gf === ga) {
      points += 1;
    }
  }
  if (!playedGames) {
    return null;
  }
  return {
    position: null,
    points,
    goalsFor,
    goalsAgainst,
    playedGames,
  };
}

function lambdaFromMatches(
  teamId: number,
  matches: FdMatch[],
  venue?: 'home' | 'away',
): number {
  let sum = 0;
  let n = 0;
  for (const m of matches) {
    const h = m.score?.fullTime?.home;
    const a = m.score?.fullTime?.away;
    if (h == null || a == null) {
      continue;
    }
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
    sum += isHome ? h : a;
    n += 1;
  }
  return n > 0 ? sum / n : 1.2;
}

function buildTeamVenueStats(
  teamId: number,
  matches: FdMatch[],
  row: FdStandingRow | undefined,
  seasonLambda: number,
  seasonP: number,
): TeamVenueStats {
  const homeLambda = lambdaFromMatches(teamId, matches, 'home');
  const awayLambda = lambdaFromMatches(teamId, matches, 'away');
  return {
    all: {
      standingDetail: standingSnapshot(row),
      lambda: seasonLambda,
      pMultigol1to6: seasonP,
      ...bandSliceFields(teamId, matches),
    },
    home: {
      standingDetail: aggregateStandingFromMatches(teamId, matches, 'home'),
      lambda: homeLambda,
      pMultigol1to6: probabilityGoalsBetween(homeLambda, 1, 6),
      ...bandSliceFields(teamId, matches, 'home'),
    },
    away: {
      standingDetail: aggregateStandingFromMatches(teamId, matches, 'away'),
      lambda: awayLambda,
      pMultigol1to6: probabilityGoalsBetween(awayLambda, 1, 6),
      ...bandSliceFields(teamId, matches, 'away'),
    },
  };
}

function standingSnapshot(row: FdStandingRow | undefined): StandingSnapshot | null {
  if (!row) {
    return null;
  }
  return {
    position: row.position,
    points: row.points,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    playedGames: row.playedGames,
  };
}

function standingLine(name: string, row: FdStandingRow | undefined): string {
  if (!row) {
    return `${name}: classifica non disponibile.`;
  }
  return `${name}: ${row.position}° posto, ${row.points} pt, ${row.goalsFor} gol fatti e ${row.goalsAgainst} subiti in ${row.playedGames} gare.`;
}

function h2hMultigolRates(
  h2h: FdHead2HeadResponse | undefined,
): { homePct: number; awayPct: number } | null {
  if (!h2h?.matches?.length) {
    return null;
  }
  let homeInBand = 0;
  let awayInBand = 0;
  let counted = 0;
  for (const m of h2h.matches) {
    const h = m.score?.fullTime?.home;
    const a = m.score?.fullTime?.away;
    if (h == null || a == null) {
      continue;
    }
    counted += 1;
    if (h >= 1 && h <= 6) {
      homeInBand += 1;
    }
    if (a >= 1 && a <= 6) {
      awayInBand += 1;
    }
  }
  if (!counted) {
    return null;
  }
  return {
    homePct: Math.round((homeInBand / counted) * 100),
    awayPct: Math.round((awayInBand / counted) * 100),
  };
}

function h2hMatchEntries(
  h2h: FdHead2HeadResponse | undefined,
  fixtureHomeTeamId: number,
): H2hMatchEntry[] {
  if (!h2h?.matches?.length) {
    return [];
  }
  const sorted = [...h2h.matches]
    .filter((m) => {
      const h = m.score?.fullTime?.home;
      const a = m.score?.fullTime?.away;
      return h != null && a != null;
    })
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime());
  return sorted.map((m) => {
    const h = m.score.fullTime.home!;
    const a = m.score.fullTime.away!;
    return {
      matchId: m.id,
      utcDate: m.utcDate,
      homeTeamName: teamName(m.homeTeam),
      homeTeamCrest: teamCrestUrl(m.homeTeam),
      awayTeamName: teamName(m.awayTeam),
      awayTeamCrest: teamCrestUrl(m.awayTeam),
      scoreHome: h,
      scoreAway: a,
      fixtureHomeAtHome: m.homeTeam.id === fixtureHomeTeamId,
    };
  });
}

function h2hLine(h2h: FdHead2HeadResponse, homeName: string, awayName: string): string {
  const n = h2h.aggregates?.numberOfMatches ?? 0;
  if (n === 0) {
    return 'H2H: nessuno storico recente in API.';
  }
  const scores: string[] = [];
  for (const m of h2h.matches ?? []) {
    const h = m.score?.fullTime?.home;
    const a = m.score?.fullTime?.away;
    if (h == null || a == null) {
      continue;
    }
    scores.push(`${h}-${a}`);
  }
  const rates = h2hMultigolRates(h2h);
  const rateTxt =
    rates != null
      ? ` Multigol 1-6 casa in ${rates.homePct}% dei match, ospite in ${rates.awayPct}%.`
      : '';
  return `H2H (${n} match): risultati ${scores.slice(0, 5).join(', ')}.${rateTxt}`;
}

export function pickMultigol(
  pHome: number,
  pAway: number,
  lambdaHome: number,
  lambdaAway: number,
): MultigolPick | null {
  const candidates: MultigolPick[] = [];
  if (pHome >= MIN_BAND_PROBABILITY && lambdaHome >= MIN_LAMBDA_SIDE) {
    candidates.push({
      outcomeLabel: OUTCOME_HOME_1_6,
      probability: pHome,
      lambdaSide: lambdaHome,
    });
  }
  if (pAway >= MIN_BAND_PROBABILITY && lambdaAway >= MIN_LAMBDA_SIDE) {
    candidates.push({
      outcomeLabel: OUTCOME_AWAY_1_6,
      probability: pAway,
      lambdaSide: lambdaAway,
    });
  }
  if (!candidates.length) {
    return null;
  }
  return candidates.sort((a, b) => b.probability - a.probability)[0];
}

export function buildDossier(input: {
  match: FdMatch;
  leagueCode: string;
  leagueName: string;
  homeRow?: FdStandingRow;
  awayRow?: FdStandingRow;
  homeForm?: FdMatch[];
  awayForm?: FdMatch[];
  h2h?: FdHead2HeadResponse;
}): MatchDossier {
  const homeName = teamName(input.match.homeTeam);
  const awayName = teamName(input.match.awayTeam);
  const h = seasonRates(input.homeRow);
  const a = seasonRates(input.awayRow);
  const { lambdaHome, lambdaAway } = estimateLambdasFromSeason({
    homeAttack: h.att,
    homeDefense: h.def,
    awayAttack: a.att,
    awayDefense: a.def,
  });

  const pHome1to6 = probabilityGoalsBetween(lambdaHome, 1, 6);
  const pAway1to6 = probabilityGoalsBetween(lambdaAway, 1, 6);
  const pick = pickMultigol(pHome1to6, pAway1to6, lambdaHome, lambdaAway);

  const homeForm = input.homeForm ?? [];
  const awayForm = input.awayForm ?? [];

  return {
    matchId: input.match.id,
    leagueCode: input.leagueCode,
    leagueName: input.leagueName,
    utcDate: input.match.utcDate,
    eventName: `${homeName} - ${awayName}`,
    homeTeam: {
      id: input.match.homeTeam.id,
      name: homeName,
      crest: input.match.homeTeam.crest ?? null,
    },
    awayTeam: {
      id: input.match.awayTeam.id,
      name: awayName,
      crest: input.match.awayTeam.crest ?? null,
    },
    lambdaHome,
    lambdaAway,
    pHome1to6,
    pAway1to6,
    pick,
    stats: {
      homeStanding: standingLine(homeName, input.homeRow),
      awayStanding: standingLine(awayName, input.awayRow),
      homeStandingDetail: standingSnapshot(input.homeRow),
      awayStandingDetail: standingSnapshot(input.awayRow),
      homeFormGoals: formGoalsLine(input.match.homeTeam.id, homeForm, homeName),
      awayFormGoals: formGoalsLine(input.match.awayTeam.id, awayForm, awayName),
      homeFormGoalsDetail: formGoalsEntries(input.match.homeTeam.id, homeForm, 6),
      awayFormGoalsDetail: formGoalsEntries(input.match.awayTeam.id, awayForm, 6),
      h2hSummary: input.h2h
        ? h2hLine(input.h2h, homeName, awayName)
        : 'H2H: non caricato (elenco rapido).',
      h2hMatchesDetail: h2hMatchEntries(input.h2h, input.match.homeTeam.id),
      h2hMultigolHomePct: h2hMultigolRates(input.h2h)?.homePct ?? null,
      h2hMultigolAwayPct: h2hMultigolRates(input.h2h)?.awayPct ?? null,
      homeBandRate: bandRate(input.match.homeTeam.id, homeForm, 'home'),
      awayBandRate: bandRate(input.match.awayTeam.id, awayForm, 'away'),
      homeVenueStats: buildTeamVenueStats(
        input.match.homeTeam.id,
        homeForm,
        input.homeRow,
        lambdaHome,
        pHome1to6,
      ),
      awayVenueStats: buildTeamVenueStats(
        input.match.awayTeam.id,
        awayForm,
        input.awayRow,
        lambdaAway,
        pAway1to6,
      ),
    },
  };
}

export function deterministicExplanation(d: MatchDossier): string {
  if (!d.pick) {
    return 'Nessun multigol 1-6 con probabilità sufficiente sui dati disponibili.';
  }
  const isHome = d.pick.outcomeLabel === OUTCOME_HOME_1_6;
  const side = isHome ? d.homeTeam.name : d.awayTeam.name;
  const lambda = isHome ? d.lambdaHome : d.lambdaAway;
  const p = d.pick.probability;
  const band = isHome ? d.stats.homeBandRate : d.stats.awayBandRate;
  const bandTxt =
    band != null
      ? ` Storicamente ${side} resta nella fascia 1-6 gol nel ${Math.round(band * 100)}% delle ultime partite (${isHome ? 'casa' : 'trasferta'}).`
      : '';
  return (
    `Per ${d.eventName} (${d.leagueName}), il modello stima ${(p * 100).toFixed(1)}% di probabilità per "${d.pick.outcomeLabel}": ` +
    `gol attesi ${side} ≈ ${lambda.toFixed(2)}.${bandTxt} ${d.stats.homeStanding} ${d.stats.awayStanding} ${d.stats.h2hSummary}`
  );
}
