import { BetStatus } from '../common/enums/bet-status.enum';
import { BetEvent } from './entities/bet-event.entity';

export function deriveBetStatusFromEvents(events: BetEvent[]): BetStatus {
  if (!events.length) {
    return BetStatus.PENDING;
  }

  const results = events.map((event) => event.resultStatus);

  if (results.some((result) => result === BetStatus.LOST)) {
    return BetStatus.LOST;
  }

  if (results.every((result) => result === BetStatus.WON)) {
    return BetStatus.WON;
  }

  return BetStatus.PENDING;
}
