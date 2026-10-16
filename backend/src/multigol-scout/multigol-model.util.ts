import type {
  ApiFootballInjuryItem,
  ApiFootballOddsItem,
  MultigolApiFootballSeasonStats,
} from './api-football.types';
import type { FdMatch, FdStandingRow } from './football-data.types';
import { probabilityGoalsBetween } from './multigol.poisson';

/**
 * Versione del modello di calcolo. Incrementala quando cambiano le distribuzioni:
 * al boot il server ricalcola le partite di oggi (vedi `MultigolScoutService`).
 */
export const MULTIGOL_MODEL_VERSION = 2;

/** Emivita (in gare) del peso esponenziale sulla forma recente. */
const FORM_HALF_LIFE_MATCHES = 5;
/** Quota gol casa/trasferta rispetto alla media per squadra-gara della lega. */
const HOME_GOALS_SHARE = 1.09;
const AWAY_GOALS_SHARE = 0.91;
/** Forza del prior bayesiano sulla frequenza empirica (gare "virtuali"). */
const EMPIRICAL_PRIOR_STRENGTH = 6;
/** Mai oltre questa sintesi: nessun pick è certo. */
const MAX_SYNTHESIS_PERCENT = 97;

export type MultigolVenue = 'home' | 'away';

export type MultigolMarketQuote = {
  /** Mercato "Total - Home/Away", linea Over 0.5 = la squadra segna almeno 1 gol. */
  betName: string;
  line: 0.5;
  overOdd: number | null;
  underOdd: number | null;
  /** 1 / quota Over (include il margine del bookmaker). */
  impliedOverPercent: number | null;
  /** Probabilità Over 0.5 senza margine (mediana tra bookmaker). */
  fairOverPercent: number;
  fairMinPercent: number;
  fairMaxPercent: number;
  bookmakers: number;
  bookmakerNames: string[];
};

export type MultigolInjuryEntry = {
  teamId: number;
  player: string;
  type: string | null;
  reason: string | null;
};

export type MultigolModelContext = {
  venue: MultigolVenue;
  /** Statistiche stagionali della squadra del pick (campionato domestico per le coppe). */
  teamSeason?: MultigolApiFootballSeasonStats | null;
  /** Statistiche stagionali dell'avversaria. */
  oppSeason?: MultigolApiFootballSeasonStats | null;
  /** Gol medi per squadra-gara nella lega (da classifica); null per le coppe UEFA. */
  leagueAvgGoalsPerTeamGame?: number | null;
  market?: MultigolMarketQuote | null;
};

export type MultigolLambdaSource = {
  key: 'season' | 'form' | 'leagueRelative' | 'xg';
  label: string;
  value: number | null;
  /** Quota (0–1) di questa fonte nel λ finale. */
  share: number;
  note: string;
};

export type MultigolModelComponent = {
  key: 'poisson' | 'scoring' | 'empirical' | 'market';
  label: string;
  percent: number | null;
  /** Quota (0–1) di questo canale nella sintesi finale. */
  share: number;
  note: string;
};

export type MultigolModelBreakdown = {
  version: number;
  venue: MultigolVenue;
  lambda: {
    final: number;
    /** λ da sola forma recente pesata (null se nessuna gara nel campione). */
    form: number | null;
    sources: MultigolLambdaSource[];
  };
  /** P(gol squadra 1–6) con Poisson sul λ finale, in %. */
  poissonPercent: number;
  scoring: {
    teamFailedToScorePercent: number | null;
    teamVenueGames: number | null;
    oppCleanSheetPercent: number | null;
    oppVenueGames: number | null;
    directPercent: number | null;
  };
  empirical: {
    hits: number;
    matches: number;
    rawPercent: number | null;
    shrunkPercent: number | null;
  };
  market: MultigolMarketQuote | null;
  league: {
    avgGoalsPerTeamGame: number;
    venueAvgGoals: number;
    attackRelative: number;
    defenceRelative: number;
  } | null;
  components: MultigolModelComponent[];
  synthesisPercent: number;
};

export type MultigolRestInfo = {
  days: number | null;
  lastMatchDate: string | null;
};

export type MultigolInsights = {
  modelVersion: number;
  pickSide: MultigolVenue | null;
  pickTeamName: string | null;
  breakdown: MultigolModelBreakdown | null;
  rest: { home: MultigolRestInfo; away: MultigolRestInfo };
  injuries: {
    available: boolean;
    home: MultigolInjuryEntry[];
    away: MultigolInjuryEntry[];
  };
  notes: string[];
};

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Gol medi per squadra-gara della lega (somma gol fatti / somma gare giocate). */
export function averageGoalsPerTeamGame(
  rows: Iterable<FdStandingRow>,
): number | null {
  let goals = 0;
  let games = 0;
  for (const row of rows) {
    if (row.playedGames > 0) {
      goals += row.goalsFor;
      games += row.playedGames;
    }
  }
  return games >= 20 ? goals / games : null;
}

/** Gol segnati dalla squadra nelle gare finite al venue indicato, dalla più recente. */
function venueGoals(teamId: number, form: FdMatch[], venue: MultigolVenue): number[] {
  return [...form]
    .filter((m) => {
      const h = m.score?.fullTime?.home;
      const a = m.score?.fullTime?.away;
      if (h == null || a == null) {
        return false;
      }
      return venue === 'home'
        ? m.homeTeam.id === teamId
        : m.awayTeam.id === teamId;
    })
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())
    .map((m) =>
      venue === 'home' ? m.score.fullTime.home! : m.score.fullTime.away!,
    );
}

function leagueRelative(
  venue: MultigolVenue,
  ctx: MultigolModelContext | null,
): {
  lambda: number;
  avg: number;
  venueAvg: number;
  attack: number;
  defence: number;
  teamGames: number;
  oppGames: number;
} | null {
  const avg = ctx?.leagueAvgGoalsPerTeamGame;
  const team = ctx?.teamSeason;
  const opp = ctx?.oppSeason;
  if (!avg || avg <= 0 || !team || !opp) {
    return null;
  }
  const goalsFor =
    venue === 'home' ? team.avgGoalsForHome : team.avgGoalsForAway;
  const goalsAgainst =
    venue === 'home' ? opp.avgGoalsAgainstAway : opp.avgGoalsAgainstHome;
  const teamGames = venue === 'home' ? team.playedHome : team.playedAway;
  const oppGames = venue === 'home' ? opp.playedAway : opp.playedHome;
  if (
    goalsFor == null ||
    goalsAgainst == null ||
    !teamGames ||
    !oppGames ||
    teamGames < 3 ||
    oppGames < 3
  ) {
    return null;
  }
  const venueAvg = avg * (venue === 'home' ? HOME_GOALS_SHARE : AWAY_GOALS_SHARE);
  // Forza relativa con shrink verso 1 sui campioni piccoli.
  const attack = 1 + (goalsFor / venueAvg - 1) * (teamGames / (teamGames + 5));
  const defence = 1 + (goalsAgainst / venueAvg - 1) * (oppGames / (oppGames + 5));
  return {
    lambda: clamp(venueAvg * attack * defence, 0.1, 4.5),
    avg,
    venueAvg,
    attack,
    defence,
    teamGames,
    oppGames,
  };
}

function rate(count: number | null | undefined, games: number | null | undefined) {
  if (count == null || !games || games < 3) {
    return null;
  }
  return clamp(count / games, 0, 1);
}

/**
 * Modello v2 per il pick "Multigol Casa/Ospite 1–6" (la squadra segna 1–6 gol).
 *
 * λ finale = media pesata di: classifica stagionale, forma recente (pesi esponenziali),
 * forza attacco/difesa relativa alla media lega e xG. Sulla probabilità finale si
 * mescolano: Poisson(λ), tasso di segnatura reale (gare senza segnare / porta
 * inviolata dell'avversaria), frequenza empirica con prior bayesiano e quota di mercato
 * senza margine. Nessun canale può dare 100% da campioni piccoli (4/4 ≠ 100%).
 */
export function computePickModel(input: {
  venue: MultigolVenue;
  teamId: number;
  seasonLambda: number;
  form: FdMatch[];
  xgLambda: number | null;
  xgSamples: number;
  ctx?: MultigolModelContext | null;
}): MultigolModelBreakdown {
  const { venue } = input;
  const ctx = input.ctx ?? null;
  const venueLabel = venue === 'home' ? 'in casa' : 'in trasferta';

  const goals = venueGoals(input.teamId, input.form, venue);
  const n = goals.length;
  let formLambda: number | null = null;
  if (n > 0) {
    let weightSum = 0;
    let weighted = 0;
    goals.forEach((g, i) => {
      const w = Math.pow(0.5, i / FORM_HALF_LIFE_MATCHES);
      weightSum += w;
      weighted += w * g;
    });
    formLambda = weighted / weightSum;
  }
  const hits = goals.filter((g) => g >= 1 && g <= 6).length;

  const rel = leagueRelative(venue, ctx);
  const xgOk =
    input.xgLambda != null &&
    Number.isFinite(input.xgLambda) &&
    input.xgLambda > 0 &&
    input.xgSamples >= 3;

  const rawSources: Array<Omit<MultigolLambdaSource, 'share'> & { weight: number }> = [
    {
      key: 'season',
      label: 'Classifica stagionale',
      value: input.seasonLambda,
      weight: 0.3,
      note: 'Gol fatti/subiti a partita in classifica, con vantaggio campo.',
    },
    {
      key: 'form',
      label: 'Forma recente (pesata)',
      value: formLambda,
      weight: formLambda != null ? 0.3 * (n / (n + 3)) : 0,
      note:
        n > 0
          ? `${n} gare ${venueLabel}; le più recenti pesano di più (emivita ${FORM_HALF_LIFE_MATCHES} gare).`
          : 'Nessuna gara nel campione.',
    },
    {
      key: 'leagueRelative',
      label: 'Attacco vs difesa (media lega)',
      value: rel?.lambda ?? null,
      weight: rel ? 0.25 : 0,
      note: rel
        ? `Attacco ×${round2(rel.attack)} · difesa avversaria ×${round2(rel.defence)} rispetto alla media lega (${round2(rel.venueAvg)} gol ${venueLabel}).`
        : 'Non disponibile (coppe UEFA o statistiche stagionali insufficienti).',
    },
    {
      key: 'xg',
      label: 'xG medio',
      value: xgOk ? input.xgLambda : null,
      weight: xgOk ? 0.25 * Math.min(1, input.xgSamples / 8) : 0,
      note: xgOk
        ? `xG medio ${venueLabel} su ${input.xgSamples} gare.`
        : 'xG non disponibile o campione < 3 gare.',
    },
  ];
  const lambdaWeightSum = rawSources.reduce(
    (s, src) => (src.value != null ? s + src.weight : s),
    0,
  );
  const lambdaFinal = clamp(
    rawSources.reduce(
      (s, src) => (src.value != null ? s + src.value * src.weight : s),
      0,
    ) / lambdaWeightSum,
    0.05,
    4.5,
  );
  const sources: MultigolLambdaSource[] = rawSources.map((src) => ({
    key: src.key,
    label: src.label,
    value: src.value != null ? round2(src.value) : null,
    share: src.value != null ? src.weight / lambdaWeightSum : 0,
    note: src.note,
  }));

  const poisson = probabilityGoalsBetween(lambdaFinal, 1, 6);

  // Tasso di segnatura reale (gare senza segnare / porta inviolata avversaria).
  const team = ctx?.teamSeason ?? null;
  const opp = ctx?.oppSeason ?? null;
  const teamGames = venue === 'home' ? team?.playedHome : team?.playedAway;
  const oppGames = venue === 'home' ? opp?.playedAway : opp?.playedHome;
  const teamFail = rate(
    venue === 'home' ? team?.failedToScoreHome : team?.failedToScoreAway,
    teamGames,
  );
  const oppCleanSheet = rate(
    venue === 'home' ? opp?.cleanSheetsAway : opp?.cleanSheetsHome,
    oppGames,
  );
  // Riduzione bayesiana: 0 "blank" su pochi match non vuol dire 0% di rischio.
  // Prior = P(0 gol) del modello Poisson sul λ finale.
  const blankPrior = Math.exp(-lambdaFinal);
  const shrinkBlank = (r: number | null, games: number | null | undefined) =>
    r == null || !games
      ? null
      : (r * games + EMPIRICAL_PRIOR_STRENGTH * blankPrior) /
        (games + EMPIRICAL_PRIOR_STRENGTH);
  const teamFailShrunk = shrinkBlank(teamFail, teamGames);
  const oppCleanSheetShrunk = shrinkBlank(oppCleanSheet, oppGames);
  let directFraction: number | null = null;
  let directWeight = 0;
  if (teamFailShrunk != null || oppCleanSheetShrunk != null) {
    const blank =
      teamFailShrunk != null && oppCleanSheetShrunk != null
        ? (teamFailShrunk + oppCleanSheetShrunk) / 2
        : (teamFailShrunk ?? oppCleanSheetShrunk)!;
    const tail = probabilityGoalsBetween(lambdaFinal, 7, 25);
    directFraction = clamp(1 - blank - tail, 0, 1);
    const games = Math.min(
      teamFail != null ? (teamGames ?? 0) : Infinity,
      oppCleanSheet != null ? (oppGames ?? 0) : Infinity,
    );
    directWeight =
      0.22 *
      Math.min(1, games / 10) *
      (teamFail != null && oppCleanSheet != null ? 1 : 0.6);
  }

  // Frequenza empirica con prior bayesiano sul mix Poisson + tasso di segnatura.
  const priorDen = 1 + (directFraction != null ? directWeight : 0);
  const prior =
    (poisson + (directFraction != null ? directFraction * directWeight : 0)) /
    priorDen;
  const empiricalRaw = n > 0 ? hits / n : null;
  const empiricalShrunk =
    n > 0 ? (hits + EMPIRICAL_PRIOR_STRENGTH * prior) / (n + EMPIRICAL_PRIOR_STRENGTH) : null;
  const empiricalWeight = n > 0 ? 0.4 * (n / (n + 8)) : 0;

  const market = ctx?.market ?? null;
  const marketFraction = market ? market.fairOverPercent / 100 : null;
  const marketWeight = market ? 0.35 : 0;

  const rawComponents: Array<
    Omit<MultigolModelComponent, 'share'> & { fraction: number | null; weight: number }
  > = [
    {
      key: 'poisson',
      label: 'Poisson sul λ finale',
      fraction: poisson,
      percent: round1(poisson * 100),
      weight: 1,
      note: `λ ${round2(lambdaFinal)} gol/gara (media di ${rawSources.filter((s) => s.value != null).length} fonti).`,
    },
    {
      key: 'scoring',
      label: 'Tasso di segnatura reale',
      fraction: directFraction,
      percent: directFraction != null ? round1(directFraction * 100) : null,
      weight: directFraction != null ? directWeight : 0,
      note:
        directFraction != null
          ? `Gare senza segnare ${teamFail != null ? `${round1(teamFail * 100)}%` : 'n/d'} · porta inviolata avversaria ${oppCleanSheet != null ? `${round1(oppCleanSheet * 100)}%` : 'n/d'} (dati grezzi, ridotti verso il Poisson di ${EMPIRICAL_PRIOR_STRENGTH} gare).`
          : 'Statistiche stagionali non disponibili.',
    },
    {
      key: 'empirical',
      label: 'Frequenza empirica (ridotta)',
      fraction: empiricalShrunk,
      percent: empiricalShrunk != null ? round1(empiricalShrunk * 100) : null,
      weight: empiricalWeight,
      note:
        n > 0
          ? `${hits}/${n} gare ${venueLabel} (${round1((empiricalRaw ?? 0) * 100)}% grezza), ridotta verso il modello: ${EMPIRICAL_PRIOR_STRENGTH} gare di prior.`
          : 'Campione insufficiente.',
    },
    {
      key: 'market',
      label: 'Quota di mercato (senza margine)',
      fraction: marketFraction,
      percent: market ? round1(market.fairOverPercent) : null,
      weight: marketWeight,
      note: market
        ? `Over 0.5 squadra, mediana di ${market.bookmakers} bookmaker.`
        : 'Quote non disponibili.',
    },
  ];
  const weightSum = rawComponents.reduce(
    (s, c) => (c.fraction != null ? s + c.weight : s),
    0,
  );
  const mixed =
    rawComponents.reduce(
      (s, c) => (c.fraction != null ? s + c.fraction * c.weight : s),
      0,
    ) / weightSum;
  const synthesisPercent = round1(
    Math.min(MAX_SYNTHESIS_PERCENT, Math.max(0, mixed * 100)),
  );
  const components: MultigolModelComponent[] = rawComponents.map((c) => ({
    key: c.key,
    label: c.label,
    percent: c.percent,
    share: c.fraction != null ? c.weight / weightSum : 0,
    note: c.note,
  }));

  return {
    version: MULTIGOL_MODEL_VERSION,
    venue,
    lambda: { final: lambdaFinal, form: formLambda, sources },
    poissonPercent: poisson * 100,
    scoring: {
      teamFailedToScorePercent: teamFail != null ? round1(teamFail * 100) : null,
      teamVenueGames: teamGames ?? null,
      oppCleanSheetPercent:
        oppCleanSheet != null ? round1(oppCleanSheet * 100) : null,
      oppVenueGames: oppGames ?? null,
      directPercent: directFraction != null ? round1(directFraction * 100) : null,
    },
    empirical: {
      hits,
      matches: n,
      rawPercent: empiricalRaw != null ? round1(empiricalRaw * 100) : null,
      shrunkPercent:
        empiricalShrunk != null ? round1(empiricalShrunk * 100) : null,
    },
    market,
    league: rel
      ? {
          avgGoalsPerTeamGame: round2(rel.avg),
          venueAvgGoals: round2(rel.venueAvg),
          attackRelative: round2(rel.attack),
          defenceRelative: round2(rel.defence),
        }
      : null,
    components,
    synthesisPercent,
  };
}

/** Estrae la quota Over/Under 0.5 squadra, senza margine, da `/odds` (mediana bookmaker). */
export function parseTeamTotalMarket(
  items: ApiFootballOddsItem[] | null | undefined,
): MultigolMarketQuote | null {
  const fair: number[] = [];
  const overs: number[] = [];
  const unders: number[] = [];
  const names: string[] = [];
  let betName = 'Total';
  for (const item of items ?? []) {
    for (const bookmaker of item.bookmakers ?? []) {
      for (const bet of bookmaker.bets ?? []) {
        const over = bet.values?.find((v) => v.value?.trim() === 'Over 0.5');
        const under = bet.values?.find((v) => v.value?.trim() === 'Under 0.5');
        const overOdd = Number.parseFloat(over?.odd ?? '');
        const underOdd = Number.parseFloat(under?.odd ?? '');
        if (!(overOdd > 1) || !(underOdd > 1)) {
          continue;
        }
        const pOver = 1 / overOdd;
        const pUnder = 1 / underOdd;
        fair.push(pOver / (pOver + pUnder));
        overs.push(overOdd);
        unders.push(underOdd);
        names.push(bookmaker.name);
        betName = bet.name || betName;
      }
    }
  }
  if (!fair.length) {
    return null;
  }
  const overMedian = median(overs);
  return {
    betName,
    line: 0.5,
    overOdd: round2(overMedian),
    underOdd: round2(median(unders)),
    impliedOverPercent: round1(100 / overMedian),
    fairOverPercent: round1(median(fair) * 100),
    fairMinPercent: round1(Math.min(...fair) * 100),
    fairMaxPercent: round1(Math.max(...fair) * 100),
    bookmakers: fair.length,
    bookmakerNames: [...new Set(names)].slice(0, 6),
  };
}

export function mapInjuries(
  items: ApiFootballInjuryItem[] | null | undefined,
): MultigolInjuryEntry[] {
  const seen = new Set<string>();
  const out: MultigolInjuryEntry[] = [];
  for (const row of items ?? []) {
    const player = row.player?.name?.trim();
    if (!player || row.team?.id == null) {
      continue;
    }
    const key = `${row.team.id}:${player}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      teamId: row.team.id,
      player,
      type: row.player.type?.trim() || null,
      reason: row.player.reason?.trim() || null,
    });
  }
  return out;
}

/** Giorni dall'ultima gara finita (nel campione forma) prima del calcio d'inizio. */
export function restInfo(
  matchDates: string[],
  kickoffUtc: string,
): MultigolRestInfo {
  const kickoff = new Date(kickoffUtc).getTime();
  let last: number | null = null;
  for (const date of matchDates) {
    const t = new Date(date).getTime();
    if (!Number.isFinite(t) || t >= kickoff) {
      continue;
    }
    if (last == null || t > last) {
      last = t;
    }
  }
  if (last == null) {
    return { days: null, lastMatchDate: null };
  }
  return {
    days: Math.max(0, Math.floor((kickoff - last) / 86_400_000)),
    lastMatchDate: new Date(last).toISOString(),
  };
}

export function buildInsights(input: {
  breakdown: MultigolModelBreakdown | null;
  pickTeamName: string | null;
  homeTeamId: number;
  awayTeamId: number;
  /** Date (ISO) delle ultime gare finite di ciascuna squadra. */
  homeFormDates: string[];
  awayFormDates: string[];
  kickoffUtc: string;
  injuries: MultigolInjuryEntry[] | null;
}): MultigolInsights {
  const notes: string[] = [];
  const b = input.breakdown;
  if (b && !b.market) {
    notes.push('Quote bookmaker non disponibili per questa partita: sintesi senza canale mercato.');
  }
  if (b && !b.league) {
    notes.push(
      'Forza attacco/difesa vs media lega non disponibile (coppe UEFA o statistiche insufficienti).',
    );
  }
  if (b && b.scoring.directPercent == null) {
    notes.push('Tasso di segnatura reale non disponibile (statistiche stagionali assenti).');
  }
  notes.push(
    'Infortuni e giorni di riposo sono mostrati come contesto: non modificano la percentuale (nessun peso validato).',
  );
  return {
    modelVersion: MULTIGOL_MODEL_VERSION,
    pickSide: b?.venue ?? null,
    pickTeamName: input.pickTeamName,
    breakdown: b,
    rest: {
      home: restInfo(input.homeFormDates, input.kickoffUtc),
      away: restInfo(input.awayFormDates, input.kickoffUtc),
    },
    injuries: {
      available: input.injuries != null,
      home: (input.injuries ?? []).filter((i) => i.teamId === input.homeTeamId),
      away: (input.injuries ?? []).filter((i) => i.teamId === input.awayTeamId),
    },
    notes,
  };
}
