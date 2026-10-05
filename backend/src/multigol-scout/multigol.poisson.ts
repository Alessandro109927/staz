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

function poisson(k: number, lambda: number): number {
  if (lambda <= 0) {
    return k === 0 ? 1 : 0;
  }
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

export function probabilityGoalsBetween(
  lambda: number,
  minGoals: number,
  maxGoals: number,
): number {
  const l = Math.max(0.05, Math.min(4.5, lambda));
  let sum = 0;
  for (let k = minGoals; k <= maxGoals; k += 1) {
    sum += poisson(k, l);
  }
  return sum;
}

export function estimateLambdasFromSeason(input: {
  homeAttack: number;
  homeDefense: number;
  awayAttack: number;
  awayDefense: number;
}): { lambdaHome: number; lambdaAway: number } {
  let lambdaHome = (input.homeAttack + input.awayDefense) / 2;
  let lambdaAway = (input.awayAttack + input.homeDefense) / 2;
  lambdaHome *= 1.08;
  lambdaAway *= 0.94;
  return {
    lambdaHome: Math.max(0.2, lambdaHome),
    lambdaAway: Math.max(0.2, lambdaAway),
  };
}
