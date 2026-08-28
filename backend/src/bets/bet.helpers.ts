import Decimal from 'decimal.js';
import { formatMoney, toDecimal } from '../common/decimal.util';
import { BetEventItemDto } from './dto/bet.dto';

export function combineOdds(odds: Array<number | string | Decimal>): Decimal {
  return odds.reduce<Decimal>(
    (acc, value) => acc.mul(toDecimal(value)),
    new Decimal(1),
  );
}

export function buildEventSummary(events: BetEventItemDto[]): string {
  return events.map((event) => event.eventName).join(' + ');
}

export function normalizeEvents(events: BetEventItemDto[]) {
  const combined = combineOdds(events.map((event) => event.odds));

  return {
    combinedOdds: Number(combined.toFixed(2)),
    eventSummary: buildEventSummary(events),
    formattedEvents: events.map((event, index) => ({
      eventName: event.eventName,
      outcome: event.outcome,
      odds: formatMoney(event.odds),
      sortOrder: index,
      resultStatus: event.resultStatus ?? null,
    })),
  };
}
