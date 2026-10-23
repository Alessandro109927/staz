import { rankMatchCandidates, settleSelection } from './betfair-paper.rules';

describe('rankMatchCandidates', () => {
  const runners = [
    quote('1', 'Match Odds', 'OPEN', 'home', 'Casa', 180_000, 1.7),
    quote('1', 'Match Odds', 'OPEN', 'draw', 'The Draw', 40_000, 3.4),
    quote('1', 'Match Odds', 'OPEN', 'away', 'Ospite', 40_000, 5),
    quote('2', 'Over/Under 1.5 Goals', 'OPEN', 'over', 'Over 1.5 Goals', 40_000, 1.3),
    quote('2', 'Over/Under 1.5 Goals', 'OPEN', 'under', 'Under 1.5 Goals', 100_000, 3.2),
  ];

  it('tiene gli esiti che pesano almeno il 30% e almeno 5000 euro', () => {
    const ranked = rankMatchCandidates(runners);
    expect(ranked.map((runner) => runner.runnerId)).toEqual(['home']);
    expect(ranked[0].weight).toBe(45);
  });

  it('scarta le quote sotto 1.40 anche se il peso è alto', () => {
    const ranked = rankMatchCandidates([
      quote('1', 'Over/Under 0.5 Goals', 'OPEN', 'over', 'Over 0.5 Goals', 20_000, 1.12),
      quote('1', 'Over/Under 0.5 Goals', 'OPEN', 'under', 'Under 0.5 Goals', 8_000, 6),
    ]);
    expect(ranked).toHaveLength(0);
  });

  it('ignora un mercato chiuso anche se il peso è alto', () => {
    const ranked = rankMatchCandidates([
      quote('1', 'Match Odds', 'CLOSED', 'home', 'Casa', 80_000, 1.5),
      quote('1', 'Match Odds', 'OPEN', 'away', 'Ospite', 20_000, 4),
    ]);
    expect(ranked).toHaveLength(0);
  });
});

describe('settleSelection', () => {
  const base = {
    homeTeam: 'Casa',
    awayTeam: 'Ospite',
    fullTime: { home: 2, away: 1 },
    halfTime: { home: 1, away: 0 },
  };

  it('chiude 1X2, over e goal dal risultato', () => {
    expect(
      settleSelection({ ...base, marketName: 'Match Odds', runnerName: 'Casa' }),
    ).toBe('WON');
    expect(
      settleSelection({
        ...base,
        marketName: 'Over/Under 1.5 Goals',
        runnerName: 'Over 1.5 Goals',
      }),
    ).toBe('WON');
    expect(
      settleSelection({
        ...base,
        marketName: 'Both teams to Score?',
        runnerName: 'Yes',
      }),
    ).toBe('WON');
    expect(
      settleSelection({
        ...base,
        marketName: 'First Half Goals 0.5',
        runnerName: 'Over 0.5 Goals',
      }),
    ).toBe('WON');
  });

  it('rimborsa il draw no bet sul pareggio', () => {
    expect(
      settleSelection({
        ...base,
        fullTime: { home: 1, away: 1 },
        marketName: 'Draw no Bet',
        runnerName: 'Casa',
      }),
    ).toBe('PUSH');
  });

  it('lascia in attesa il primo tempo se il punteggio non è stato visto', () => {
    expect(
      settleSelection({
        ...base,
        halfTime: null,
        marketName: 'Half Time',
        runnerName: 'Casa',
      }),
    ).toBe('PENDING');
  });
});

function quote(
  marketId: string,
  marketName: string,
  marketStatus: string,
  runnerId: string,
  runnerName: string,
  volume: number,
  odd: number,
) {
  return {
    marketId,
    marketName,
    marketStatus,
    runnerId,
    runnerName,
    volume,
    odd,
  };
}
