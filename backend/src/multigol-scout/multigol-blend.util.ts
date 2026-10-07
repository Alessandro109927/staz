import { probabilityGoalsBetween } from './multigol.poisson';

type PickBlendInput = {
  probability: number;
  empiricalProbability: number | null;
  empiricalMatches: number;
  xgLambdaSide: number | null;
  xgSampleMatches: number;
};

/** Sintesi Poisson (λ con xG) + empirica + canale xG puro (fino ~35%). */
export function synthesisPercentFromPick(pick: PickBlendInput): number {
  const xgPoisson =
    pick.xgLambdaSide != null && pick.xgSampleMatches >= 3
      ? probabilityGoalsBetween(pick.xgLambdaSide, 1, 6)
      : null;
  return (
    Math.round(
      blendScoutProbability(
        pick.probability,
        pick.empiricalProbability,
        pick.empiricalMatches,
        xgPoisson,
        pick.xgSampleMatches,
      ) * 1000,
    ) / 10
  );
}

/**
 * Sintesi Poisson + empirica: la forma gol pesa di più quando il campione cresce (max 50%).
 * Con xG aggiunge un terzo canale (Poisson da solo xG medio venue).
 */
export function blendScoutProbability(
  poissonFraction: number,
  empiricalFraction: number | null | undefined,
  empiricalMatches: number,
  xgPoissonFraction: number | null | undefined = null,
  xgSampleMatches = 0,
): number {
  const p = Math.max(0, Math.min(1, poissonFraction));
  let mixed = p;
  if (
    empiricalFraction != null &&
    empiricalMatches > 0 &&
    Number.isFinite(empiricalFraction)
  ) {
    const e = Math.max(0, Math.min(1, empiricalFraction));
    const weight = Math.min(0.5, empiricalMatches / 12);
    mixed = (1 - weight) * p + weight * e;
  }
  if (
    xgPoissonFraction != null &&
    xgSampleMatches >= 3 &&
    Number.isFinite(xgPoissonFraction)
  ) {
    const x = Math.max(0, Math.min(1, xgPoissonFraction));
    const xgWeight = Math.min(0.35, (xgSampleMatches / 12) * 0.35);
    mixed = (1 - xgWeight) * mixed + xgWeight * x;
  }
  return mixed;
}
