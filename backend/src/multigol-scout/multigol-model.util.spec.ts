import type { FdMatch } from './football-data.types';
import {
  computePickModel,
  mapInjuries,
  parseTeamTotalMarket,
  restInfo,
} from './multigol-model.util';

function match(
  id: number,
  daysAgo: number,
  homeId: number,
  awayId: number,
  home: number,
  away: number,
): FdMatch {
  return {
    id,
    utcDate: new Date(Date.UTC(2026, 9, 16) - daysAgo * 86_400_000).toISOString(),
    homeTeam: { id: homeId, name: `T${homeId}`, crest: '' },
    awayTeam: { id: awayId, name: `T${awayId}`, crest: '' },
    score: { fullTime: { home, away } },
  } as unknown as FdMatch;
}

describe('multigol-model.util', () => {
  describe('computePickModel', () => {
    it('non dà 100% con campioni piccoli (4/4)', () => {
      const form = [1, 2, 3, 4].map((i) => match(i, i * 7, 10, 20, 2, 0));
      const model = computePickModel({
        venue: 'home',
        teamId: 10,
        seasonLambda: 1.6,
        form,
        xgLambda: null,
        xgSamples: 0,
      });
      expect(model.empirical.rawPercent).toBe(100);
      expect(model.empirical.shrunkPercent).toBeLessThan(100);
      expect(model.synthesisPercent).toBeLessThanOrEqual(97);
    });

    it('le quote di mercato spostano la sintesi verso il mercato', () => {
      const base = {
        venue: 'home' as const,
        teamId: 10,
        seasonLambda: 1.5,
        form: [] as FdMatch[],
        xgLambda: null,
        xgSamples: 0,
      };
      const without = computePickModel(base);
      const withMarket = computePickModel({
        ...base,
        ctx: {
          venue: 'home',
          market: {
            betName: 'Total - Home',
            line: 0.5,
            overOdd: 3,
            underOdd: 1.3,
            impliedOverPercent: 33.3,
            fairOverPercent: 40,
            fairMinPercent: 38,
            fairMaxPercent: 42,
            bookmakers: 3,
            bookmakerNames: ['A', 'B', 'C'],
          },
        },
      });
      expect(withMarket.synthesisPercent).toBeLessThan(without.synthesisPercent);
      expect(
        withMarket.components.find((c) => c.key === 'market')?.share,
      ).toBeGreaterThan(0);
    });

    it('il tasso di segnatura non arriva a 100% con 0 blank su pochi match', () => {
      const stats = {
        playedHome: 8,
        playedAway: 8,
        failedToScoreHome: 0,
        failedToScoreAway: 0,
        cleanSheetsHome: 0,
        cleanSheetsAway: 0,
      };
      const model = computePickModel({
        venue: 'home',
        teamId: 10,
        seasonLambda: 1.6,
        form: [],
        xgLambda: null,
        xgSamples: 0,
        ctx: {
          venue: 'home',
          teamSeason: stats as never,
          oppSeason: stats as never,
        },
      });
      expect(model.scoring.directPercent).not.toBeNull();
      expect(model.scoring.directPercent!).toBeLessThan(97);
      expect(model.scoring.directPercent!).toBeGreaterThan(70);
    });

    it('le quote di tutti i canali sommano a 1', () => {
      const form = [1, 2, 3, 4, 5, 6].map((i) =>
        match(i, i * 7, 10, 20, i % 3, 1),
      );
      const model = computePickModel({
        venue: 'home',
        teamId: 10,
        seasonLambda: 1.4,
        form,
        xgLambda: 1.2,
        xgSamples: 6,
      });
      const total = model.components.reduce((s, c) => s + c.share, 0);
      expect(total).toBeCloseTo(1, 6);
      const lambdaTotal = model.lambda.sources.reduce((s, c) => s + c.share, 0);
      expect(lambdaTotal).toBeCloseTo(1, 6);
    });

    it('la forma recente pesa più della vecchia', () => {
      // 0 gol recenti, tanti gol vecchi → λ forma bassa
      const recentDry = [
        match(1, 7, 10, 20, 0, 1),
        match(2, 14, 10, 20, 0, 1),
        match(3, 70, 10, 20, 4, 0),
        match(4, 77, 10, 20, 4, 0),
      ];
      const model = computePickModel({
        venue: 'home',
        teamId: 10,
        seasonLambda: 1.5,
        form: recentDry,
        xgLambda: null,
        xgSamples: 0,
      });
      expect(model.lambda.form).not.toBeNull();
      expect(model.lambda.form!).toBeLessThan(2);
    });
  });

  describe('parseTeamTotalMarket', () => {
    it('toglie il margine e usa la mediana', () => {
      const quote = parseTeamTotalMarket([
        {
          bookmakers: [
            {
              name: 'A',
              bets: [
                {
                  name: 'Total - Home',
                  values: [
                    { value: 'Over 0.5', odd: '1.25' },
                    { value: 'Under 0.5', odd: '4.00' },
                  ],
                },
              ],
            },
          ],
        },
      ] as never);
      expect(quote).not.toBeNull();
      // 1/1.25=0.8, 1/4=0.25 → 0.8/1.05 ≈ 76.2%
      expect(quote!.fairOverPercent).toBeCloseTo(76.2, 1);
      expect(quote!.impliedOverPercent).toBeCloseTo(80, 0);
    });

    it('null senza quote', () => {
      expect(parseTeamTotalMarket([])).toBeNull();
      expect(parseTeamTotalMarket(null)).toBeNull();
    });
  });

  describe('restInfo', () => {
    it('conta i giorni dall’ultima gara prima del calcio d’inizio', () => {
      const info = restInfo(
        ['2026-10-10T18:00:00Z', '2026-10-01T18:00:00Z', '2026-10-17T18:00:00Z'],
        '2026-10-14T18:00:00Z',
      );
      expect(info.days).toBe(4);
    });
    it('null senza gare', () => {
      expect(restInfo([], '2026-10-14T18:00:00Z').days).toBeNull();
    });
  });

  describe('mapInjuries', () => {
    it('deduplica e scarta righe incomplete', () => {
      const out = mapInjuries([
        { player: { id: 1, name: 'Rossi', type: 'Missing Fixture', reason: 'Knee' }, team: { id: 5, name: 'X' } },
        { player: { id: 1, name: 'Rossi', type: 'Missing Fixture', reason: 'Knee' }, team: { id: 5, name: 'X' } },
        { player: { id: 2, name: '', type: null, reason: null }, team: { id: 5, name: 'X' } },
      ] as never);
      expect(out).toHaveLength(1);
      expect(out[0].player).toBe('Rossi');
    });
  });
});
