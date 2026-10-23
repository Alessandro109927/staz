import Decimal from 'decimal.js';

export const PAPER_WEIGHT_PERCENT = 30;
export const PAPER_MIN_VOLUME = 5000;
export const PAPER_MIN_ODD = 1.4;
export const PAPER_MAX_PICKS_PER_MATCH = 2;

export type PaperRunner = {
  marketId: string;
  marketName: string;
  marketStatus: string;
  runnerId: string;
  runnerName: string;
  volume: number;
  odd: number | null;
};

export type PaperCandidate = PaperRunner & {
  weight: number;
  matchVolume: number;
};

export function rankMatchCandidates(runners: PaperRunner[]): PaperCandidate[] {
  const matchVolume = runners.reduce(
    (total, runner) => total.plus(runner.volume > 0 ? runner.volume : 0),
    new Decimal(0),
  );
  if (matchVolume.lte(0)) {
    return [];
  }

  return runners
    .map((runner) => {
      const volume = runner.volume > 0 ? runner.volume : 0;
      const weight = new Decimal(volume).div(matchVolume).mul(100);
      return {
        ...runner,
        volume,
        matchVolume: matchVolume.toNumber(),
        weight: weight.toDecimalPlaces(2).toNumber(),
      };
    })
    .filter(
      (runner) =>
        runner.marketStatus.toUpperCase() === 'OPEN' &&
        runner.odd != null &&
        runner.odd >= PAPER_MIN_ODD &&
        runner.volume >= PAPER_MIN_VOLUME &&
        runner.weight >= PAPER_WEIGHT_PERCENT,
    )
    .sort(
      (left, right) =>
        right.weight - left.weight || right.volume - left.volume,
    );
}

export type SideScore = {
  home: number;
  away: number;
};

export type PaperSettlement = 'WON' | 'LOST' | 'PUSH' | 'PENDING';

export function settleSelection(input: {
  marketName: string;
  runnerName: string;
  homeTeam: string;
  awayTeam: string;
  fullTime: SideScore;
  halfTime: SideScore | null;
}): PaperSettlement {
  const market = input.marketName.trim();
  const runner = input.runnerName.trim();

  if (/^match odds$/i.test(market)) {
    return settleOneXTwo(runner, input.homeTeam, input.awayTeam, input.fullTime);
  }

  if (/^half time$/i.test(market)) {
    if (!input.halfTime) {
      return 'PENDING';
    }
    return settleOneXTwo(runner, input.homeTeam, input.awayTeam, input.halfTime);
  }

  if (/^draw no bet$/i.test(market)) {
    return settleDrawNoBet(runner, input.homeTeam, input.awayTeam, input.fullTime);
  }

  if (/^both teams to score\??$/i.test(market)) {
    const both = input.fullTime.home > 0 && input.fullTime.away > 0;
    if (/^yes$/i.test(runner)) {
      return both ? 'WON' : 'LOST';
    }
    if (/^no$/i.test(runner)) {
      return both ? 'LOST' : 'WON';
    }
    return 'PENDING';
  }

  const totalMarket = /^over\/under (\d+(?:\.\d+)?) goals$/i.exec(market);
  if (totalMarket) {
    return settleTotal(
      runner,
      Number(totalMarket[1]),
      input.fullTime.home + input.fullTime.away,
    );
  }

  const halfMarket = /^first half goals (\d+(?:\.\d+)?)$/i.exec(market);
  if (halfMarket) {
    if (!input.halfTime) {
      return 'PENDING';
    }
    return settleTotal(
      runner,
      Number(halfMarket[1]),
      input.halfTime.home + input.halfTime.away,
    );
  }

  return 'PENDING';
}

function settleOneXTwo(
  runnerName: string,
  homeTeam: string,
  awayTeam: string,
  score: SideScore,
): PaperSettlement {
  const side = runnerSide(runnerName, homeTeam, awayTeam);
  if (!side) {
    return 'PENDING';
  }
  if (side === 'draw') {
    return score.home === score.away ? 'WON' : 'LOST';
  }
  if (side === 'home') {
    return score.home > score.away ? 'WON' : 'LOST';
  }
  return score.away > score.home ? 'WON' : 'LOST';
}

function settleDrawNoBet(
  runnerName: string,
  homeTeam: string,
  awayTeam: string,
  score: SideScore,
): PaperSettlement {
  if (score.home === score.away) {
    return 'PUSH';
  }
  const side = runnerSide(runnerName, homeTeam, awayTeam);
  if (side === 'home') {
    return score.home > score.away ? 'WON' : 'LOST';
  }
  if (side === 'away') {
    return score.away > score.home ? 'WON' : 'LOST';
  }
  return 'PENDING';
}

function settleTotal(
  runnerName: string,
  line: number,
  goals: number,
): PaperSettlement {
  const over = /^over\b/i.test(runnerName);
  const under = /^under\b/i.test(runnerName);
  if (!over && !under) {
    return 'PENDING';
  }
  if (goals === line) {
    return 'PUSH';
  }
  const overWins = goals > line;
  return (over && overWins) || (under && !overWins) ? 'WON' : 'LOST';
}

function runnerSide(
  runnerName: string,
  homeTeam: string,
  awayTeam: string,
): 'home' | 'away' | 'draw' | null {
  const runner = normalizeName(runnerName);
  if (runner === 'the draw' || runner === 'draw' || runner === 'x') {
    return 'draw';
  }
  if (runner === normalizeName(homeTeam)) {
    return 'home';
  }
  if (runner === normalizeName(awayTeam)) {
    return 'away';
  }
  return null;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}
