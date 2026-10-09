import type { FdHead2HeadResponse, FdMatch, FdStandingRow } from './football-data.types';
import type {
  MultigolApiFootballMatchStats,
  MultigolApiFootballSeasonStats,
} from './api-football.types';
import {
  estimateLambdasFromSeason,
  probabilityGoalsBetween,
} from './multigol.poisson';
import { blendSideLambda } from './multigol-xg.util';
import {
  MIN_BAND_PROBABILITY,
  MIN_LAMBDA_SIDE,
  OUTCOME_AWAY_1_6,
  OUTCOME_HOME_1_6,
} from './multigol-scout.constants';

type MultigolPickCore = {
  outcomeLabel: typeof OUTCOME_HOME_1_6 | typeof OUTCOME_AWAY_1_6;
  probability: number;
  lambdaSide: number;
};

/** P(gol squadra 1–6) Poisson per l’esito del pick — mai gol totali partita. */
export function poissonProbabilityForPick(
  pick: MultigolPickCore,
  pHome1to6: number,
  pAway1to6: number,
): number {
  return pick.outcomeLabel === OUTCOME_HOME_1_6 ? pHome1to6 : pAway1to6;
}

export type MultigolPick = MultigolPickCore & {
  /** Frequenza gol 1–6 della squadra del pick (solo sui sui gol, non somma partita). */
  empiricalProbability: number | null;
  empiricalHits: number;
  empiricalMatches: number;
  /** Media xG per venue (casa/trasferta) usata nel λ del pick. */
  xgLambdaSide: number | null;
  xgSampleMatches: number;
  /** λ da soli gol reali in forma (prima del mix xG). */
  goalsLambdaSide: number;
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
  competitionName: string | null;
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
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamCrest: string | null;
  awayTeamCrest: string | null;
  scoreHome: number;
  scoreAway: number;
};

export type MatchDossier = {
  matchId: number;
  leagueCode: string;
  leagueName: string;
  utcDate: string;
  matchday: number | null;
  roundLabel: string | null;
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
    apiFootballHome?: MultigolApiFootballSeasonStats | null;
    apiFootballAway?: MultigolApiFootballSeasonStats | null;
    apiFootballFixture?: MultigolApiFootballMatchStats | null;
  };
};

function teamName(t: { shortName?: string; name: string }): string {
  return t.shortName?.trim() || t.name;
}

function teamCrestUrl(team: { id: number; crest?: string }): string | null {
  const url = team.crest?.trim();
  return url || null;
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

function formGoalsEntries(teamId: number, matches: FdMatch[]): FormGoalEntry[] {
  const sorted = [...matches].sort(
    (a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime(),
  );
  const out: FormGoalEntry[] = [];
  for (const m of sorted) {
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
      opponentCrest: teamCrestUrl(opponent) ?? '',
      goalsScored: isHome ? h : a,
      goalsConceded: isHome ? a : h,
      venue: isHome ? 'home' : 'away',
      utcDate: m.utcDate,
      homeTeamId: m.homeTeam.id,
      awayTeamId: m.awayTeam.id,
      homeTeamName: teamName(m.homeTeam),
      awayTeamName: teamName(m.awayTeam),
      homeTeamCrest: teamCrestUrl(m.homeTeam),
      awayTeamCrest: teamCrestUrl(m.awayTeam),
      scoreHome: h,
      scoreAway: a,
    });
  }
  return out;
}

function formGoalsLine(teamId: number, matches: FdMatch[], label: string): string {
  const entries = formGoalsEntries(teamId, matches).slice(0, 8);
  if (!entries.length) {
    return `${label}: nessun dato recente.`;
  }
  const parts = entries.map(
    (e) => `${e.homeTeamName} ${e.scoreHome}-${e.scoreAway} ${e.awayTeamName}`,
  );
  return `${label}: ultime gare — ${parts.join('; ')}.`;
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
      competitionName: m.competition?.name?.trim() || null,
      homeTeamName: teamName(m.homeTeam),
      homeTeamCrest: teamCrestUrl(m.homeTeam) ?? '',
      awayTeamName: teamName(m.awayTeam),
      awayTeamCrest: teamCrestUrl(m.awayTeam) ?? '',
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
  return `H2H (${n} match, storico completo): risultati ${scores.slice(0, 8).join(', ')}${scores.length > 8 ? '…' : ''}.${rateTxt}`;
}

export function enrichPickWithEmpirical(
  pick: MultigolPickCore,
  homeTeamId: number,
  awayTeamId: number,
  homeForm: FdMatch[],
  awayForm: FdMatch[],
  pHome1to6: number,
  pAway1to6: number,
  xgLambdaSide: number | null = null,
  xgSampleMatches = 0,
): MultigolPick {
  return attachEmpiricalToPick(
    pick,
    homeTeamId,
    awayTeamId,
    homeForm,
    awayForm,
    pHome1to6,
    pAway1to6,
    xgLambdaSide,
    xgSampleMatches,
  )!;
}

function pickVenueScope(
  outcomeLabel: string,
): 'home' | 'away' | null {
  if (outcomeLabel === OUTCOME_HOME_1_6) {
    return 'home';
  }
  if (outcomeLabel === OUTCOME_AWAY_1_6) {
    return 'away';
  }
  return null;
}

function attachEmpiricalToPick(
  pick: MultigolPickCore | null,
  homeTeamId: number,
  awayTeamId: number,
  homeForm: FdMatch[],
  awayForm: FdMatch[],
  pHome1to6: number,
  pAway1to6: number,
  xgLambdaSide: number | null = null,
  xgSampleMatches = 0,
): MultigolPick | null {
  if (!pick) {
    return null;
  }
  const isHome = pick.outcomeLabel === OUTCOME_HOME_1_6;
  const teamId = isHome ? homeTeamId : awayTeamId;
  const form = isHome ? homeForm : awayForm;
  const venue = pickVenueScope(pick.outcomeLabel);
  const { hits, matches: n } = bandCount(teamId, form, venue ?? undefined);
  const goalsLambdaSide =
    venue != null ? lambdaFromMatches(teamId, form, venue) : pick.lambdaSide;
  const lambdaSide = blendSideLambda(
    goalsLambdaSide,
    xgLambdaSide,
    xgSampleMatches,
  );
  const probability =
    venue != null
      ? probabilityGoalsBetween(lambdaSide, 1, 6)
      : poissonProbabilityForPick(pick, pHome1to6, pAway1to6);
  return {
    ...pick,
    lambdaSide,
    goalsLambdaSide,
    probability,
    empiricalProbability: n > 0 ? hits / n : null,
    empiricalHits: hits,
    empiricalMatches: n,
    xgLambdaSide,
    xgSampleMatches,
  };
}

export function pickMultigol(
  pHome: number,
  pAway: number,
  lambdaHome: number,
  lambdaAway: number,
): MultigolPickCore | null {
  const candidates: MultigolPickCore[] = [];
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
  const homeForm = input.homeForm ?? [];
  const awayForm = input.awayForm ?? [];
  const pick = attachEmpiricalToPick(
    pickMultigol(pHome1to6, pAway1to6, lambdaHome, lambdaAway),
    input.match.homeTeam.id,
    input.match.awayTeam.id,
    homeForm,
    awayForm,
    pHome1to6,
    pAway1to6,
  );

  return {
    matchId: input.match.id,
    leagueCode: input.leagueCode,
    leagueName: input.leagueName,
    utcDate: input.match.utcDate,
    matchday: input.match.matchday ?? null,
    roundLabel: input.match.roundLabel ?? null,
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
      homeFormGoalsDetail: formGoalsEntries(input.match.homeTeam.id, homeForm),
      awayFormGoalsDetail: formGoalsEntries(input.match.awayTeam.id, awayForm),
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

/** Ripristina classifica ufficiale se manca (es. dopo patch forma senza row). */
export function patchStandingFromRows(
  d: MatchDossier,
  homeRow: FdStandingRow | undefined,
  awayRow: FdStandingRow | undefined,
): MatchDossier {
  const homeDetail = homeRow ? standingSnapshot(homeRow) : d.stats.homeStandingDetail;
  const awayDetail = awayRow ? standingSnapshot(awayRow) : d.stats.awayStandingDetail;

  const withVenueStanding = (
    bundle: TeamVenueStats | undefined,
    detail: StandingSnapshot | null,
  ): TeamVenueStats | undefined => {
    if (!bundle || !detail) {
      return bundle;
    }
    return {
      ...bundle,
      all: {
        ...bundle.all,
        standingDetail: detail,
      },
    };
  };

  return {
    ...d,
    stats: {
      ...d.stats,
      homeStanding: homeRow
        ? standingLine(d.homeTeam.name, homeRow)
        : d.stats.homeStanding,
      awayStanding: awayRow
        ? standingLine(d.awayTeam.name, awayRow)
        : d.stats.awayStanding,
      homeStandingDetail: homeDetail,
      awayStandingDetail: awayDetail,
      homeVenueStats:
        withVenueStanding(d.stats.homeVenueStats, homeDetail) ??
        d.stats.homeVenueStats,
      awayVenueStats:
        withVenueStanding(d.stats.awayVenueStats, awayDetail) ??
        d.stats.awayVenueStats,
    },
  };
}

/** Aggiorna forma gol (e freq. empirica collegata) dopo fetch ultime gare. */
export function patchFormStats(
  d: MatchDossier,
  homeForm: FdMatch[],
  awayForm: FdMatch[],
  xgLambdaSide: number | null = null,
  xgSampleMatches = 0,
): MatchDossier {
  const homeName = d.homeTeam.name;
  const awayName = d.awayTeam.name;
  const pick = d.pick
    ? attachEmpiricalToPick(
        {
          outcomeLabel: d.pick.outcomeLabel,
          probability: d.pick.probability,
          lambdaSide: d.pick.lambdaSide,
        },
        d.homeTeam.id,
        d.awayTeam.id,
        homeForm,
        awayForm,
        d.pHome1to6,
        d.pAway1to6,
        xgLambdaSide,
        xgSampleMatches,
      )
    : null;
  return {
    ...d,
    pick,
    stats: {
      ...d.stats,
      homeFormGoals: formGoalsLine(d.homeTeam.id, homeForm, homeName),
      awayFormGoals: formGoalsLine(d.awayTeam.id, awayForm, awayName),
      homeFormGoalsDetail: formGoalsEntries(d.homeTeam.id, homeForm),
      awayFormGoalsDetail: formGoalsEntries(d.awayTeam.id, awayForm),
      homeBandRate: bandRate(d.homeTeam.id, homeForm, 'home'),
      awayBandRate: bandRate(d.awayTeam.id, awayForm, 'away'),
      homeVenueStats: {
        ...buildTeamVenueStats(
          d.homeTeam.id,
          homeForm,
          undefined,
          d.lambdaHome,
          d.pHome1to6,
        ),
        all: {
          ...buildTeamVenueStats(
            d.homeTeam.id,
            homeForm,
            undefined,
            d.lambdaHome,
            d.pHome1to6,
          ).all,
          standingDetail:
            d.stats.homeVenueStats?.all.standingDetail ??
            d.stats.homeStandingDetail,
        },
      },
      awayVenueStats: {
        ...buildTeamVenueStats(
          d.awayTeam.id,
          awayForm,
          undefined,
          d.lambdaAway,
          d.pAway1to6,
        ),
        all: {
          ...buildTeamVenueStats(
            d.awayTeam.id,
            awayForm,
            undefined,
            d.lambdaAway,
            d.pAway1to6,
          ).all,
          standingDetail:
            d.stats.awayVenueStats?.all.standingDetail ??
            d.stats.awayStandingDetail,
        },
      },
    },
  };
}

export function deterministicExplanation(d: MatchDossier): string {
  if (!d.pick) {
    return 'Nessun multigol 1-6 con probabilità sufficiente sui dati disponibili.';
  }
  const isHome = d.pick.outcomeLabel === OUTCOME_HOME_1_6;
  const side = isHome ? d.homeTeam.name : d.awayTeam.name;
  const lambda = d.pick.lambdaSide;
  const p = d.pick.probability;
  const band = isHome ? d.stats.homeBandRate : d.stats.awayBandRate;
  const bandTxt =
    band != null
      ? ` Storicamente ${side} resta nella fascia 1-6 gol nel ${Math.round(band * 100)}% delle ultime partite (${isHome ? 'casa' : 'trasferta'}).`
      : '';
  const xgTxt =
    d.pick.xgLambdaSide != null && d.pick.xgSampleMatches >= 3
      ? ` Media xG ${isHome ? 'in casa' : 'in trasferta'} ≈ ${d.pick.xgLambdaSide.toFixed(2)} (${d.pick.xgSampleMatches} gare).`
      : '';
  return (
    `Per ${d.eventName} (${d.leagueName}), il modello stima ${(p * 100).toFixed(1)}% di probabilità per "${d.pick.outcomeLabel}": ` +
    `gol attesi ${side} ≈ ${lambda.toFixed(2)} (mix gol reali + xG).${xgTxt}${bandTxt} ${d.stats.homeStanding} ${d.stats.awayStanding} ${d.stats.h2hSummary}`
  );
}
