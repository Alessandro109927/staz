function poissonMultigol16FromLambda(lambda: number): number {
  const l = Math.max(0.05, Math.min(4.5, lambda));
  let sum = 0;
  for (let k = 1; k <= 6; k += 1) {
    sum += (Math.exp(-l) * Math.pow(l, k)) / factorial(k);
  }
  return sum;
}

function factorial(n: number): number {
  if (n <= 1) {
    return 1;
  }
  let v = 1;
  for (let i = 2; i <= n; i += 1) {
    v *= i;
  }
  return v;
}

/** Allineato al backend: Poisson+empirica + canale xG (fino ~35%). */
export function blendScoutProbabilityPercent(
  poissonPercent: number,
  empiricalPercent: number | null | undefined,
  empiricalMatches: number,
  xgLambdaSide: number | null = null,
  xgSampleMatches = 0,
): number {
  const p = poissonPercent / 100;
  let mixed = p;
  if (
    empiricalPercent != null &&
    empiricalMatches > 0 &&
    Number.isFinite(empiricalPercent)
  ) {
    const e = empiricalPercent / 100;
    const weight = Math.min(0.5, empiricalMatches / 12);
    mixed = (1 - weight) * p + weight * e;
  }
  if (xgLambdaSide != null && xgSampleMatches >= 3) {
    const x = poissonMultigol16FromLambda(xgLambdaSide);
    const xgWeight = Math.min(0.35, (xgSampleMatches / 12) * 0.35);
    mixed = (1 - xgWeight) * mixed + xgWeight * x;
  }
  return Math.round(mixed * 1000) / 10;
}

export function blendScoutProbabilityHint(
  empiricalMatches: number,
  xgSampleMatches = 0,
  xgLambdaSide: number | null = null,
): string {
  const xgPart =
    xgLambdaSide != null && xgSampleMatches >= 3
      ? ` Include xG medio pick (≈${xgLambdaSide.toFixed(2)}, ${xgSampleMatches} gare).`
      : '';
  if (empiricalMatches <= 0) {
    return `Sintesi = modello Poisson + xG.${xgPart}`;
  }
  const w = Math.min(50, Math.round((empiricalMatches / 12) * 50));
  return `Sintesi: Poisson (con xG nel λ) + ${w}% empirica (${empiricalMatches} gare).${xgPart}`;
}
