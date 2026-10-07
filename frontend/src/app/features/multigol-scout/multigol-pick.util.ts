import type { MultigolAnalysis } from '../../core/models';

const OUTCOME_HOME = 'Multigol Casa 1-6';
const OUTCOME_AWAY = 'Multigol Ospite 1-6';

/** P(gol 1–6) Poisson coerente con l’esito (casa → solo casa, ospite → solo trasferta). */
export function pickSidePoissonFraction(data: MultigolAnalysis): number | null {
  if (!data.pick) {
    return null;
  }
  return data.pick.probability;
}

export function pickSideTeamLabel(data: MultigolAnalysis): string {
  if (!data.pick) {
    return '';
  }
  if (data.pick.outcomeLabel === OUTCOME_HOME) {
    return data.homeTeam.name;
  }
  if (data.pick.outcomeLabel === OUTCOME_AWAY) {
    return data.awayTeam.name;
  }
  return '';
}
