/** Converte un importo "123.45" in centesimi interi (12345). */
export function parseMoneyCents(value: string | number): number {
  const normalized = String(value).trim().replace(',', '.');
  const negative = normalized.startsWith('-');
  const abs = negative ? normalized.slice(1) : normalized;
  const [whole = '0', fraction = ''] = abs.split('.');
  const cents =
    parseInt(whole, 10) * 100 + parseInt(fraction.padEnd(2, '0').slice(0, 2), 10);

  return negative ? -cents : cents;
}

export function centsToAmount(cents: number): number {
  return cents / 100;
}

/** Differenza tra due importi, esatta al centesimo. */
export function moneyDifference(
  minuend: string | number,
  subtrahend: string | number,
): number {
  return centsToAmount(parseMoneyCents(minuend) - parseMoneyCents(subtrahend));
}

export function formatSignedMoney(value: number): string {
  const cents = Math.round(value * 100);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}
