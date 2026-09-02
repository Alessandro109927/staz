import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function toDecimal(value: string | number | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export function formatMoney(value: Decimal | string | number): string {
  return toDecimal(value).toFixed(2);
}

export function parseMoney(value: string | number): Decimal {
  return toDecimal(value);
}

export function moneyDifference(
  minuend: string | number,
  subtrahend: string | number,
): string {
  return parseMoney(minuend).minus(parseMoney(subtrahend)).toFixed(2);
}
