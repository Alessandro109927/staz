/** Peso xG sul λ lato pick (casa/trasferta) quando c’è campione sufficiente. */
export const XG_LAMBDA_BLEND_WEIGHT = 0.4;

export function blendSideLambda(
  goalsLambda: number,
  xgLambda: number | null | undefined,
  xgSamples: number,
): number {
  const g = Math.max(0.05, Math.min(4.5, goalsLambda));
  if (
    xgLambda == null ||
    !Number.isFinite(xgLambda) ||
    xgLambda <= 0 ||
    xgSamples < 3
  ) {
    return g;
  }
  const x = Math.max(0.05, Math.min(4.5, xgLambda));
  const sampleFactor = Math.min(1, xgSamples / 8);
  const w = XG_LAMBDA_BLEND_WEIGHT * sampleFactor;
  return (1 - w) * g + w * x;
}

export function xgBlendHint(xgSamples: number, xgLambda: number | null): string {
  if (xgLambda == null || xgSamples < 3) {
    return 'xG non disponibile o campione insufficiente: λ solo da gol reali.';
  }
  const w = Math.round(
    XG_LAMBDA_BLEND_WEIGHT * Math.min(1, xgSamples / 8) * 100,
  );
  return `λ lato pick: mix gol reali + xG medio in ${xgSamples} gare (${w}% peso xG ≈ ${xgLambda.toFixed(2)}).`;
}
