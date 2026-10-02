import { FormArray, FormGroup, Validators } from '@angular/forms';
import { BetEvent, BetEventItem, OutcomeOption } from '../models';
import {
  formatStoredOutcome,
  isScorerOutcomeLabel,
  parseStoredOutcome,
} from './outcome-option.util';

export type BetEventDisplayGroup = {
  eventName: string;
  picks: BetEvent[];
};

export type EventPickFormValue = {
  outcome: string;
  odds: number;
  scorerName?: string;
};

export type EventGroupFormValue = {
  eventName: string;
  picks: EventPickFormValue[];
};

export function flattenEventGroups(
  groups: EventGroupFormValue[],
  options: OutcomeOption[] = [],
): BetEventItem[] {
  const items: BetEventItem[] = [];

  for (const group of groups) {
    const eventName = group.eventName?.trim();
    if (!eventName) {
      continue;
    }
    for (const pick of group.picks ?? []) {
      items.push({
        eventName,
        outcome: formatStoredOutcome(pick.outcome ?? '', pick.scorerName, options),
        odds: Number(pick.odds),
      });
    }
  }

  return items;
}

/** Raggruppa eventi API consecutivi con lo stesso eventName (multi-esito). */
export function groupBetEventsForDisplay(events: BetEvent[]): BetEventDisplayGroup[] {
  const groups: BetEventDisplayGroup[] = [];

  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last && last.eventName === event.eventName) {
      last.picks.push(event);
    } else {
      groups.push({ eventName: event.eventName, picks: [event] });
    }
  }

  return groups;
}

/** Raggruppa righe API consecutive con lo stesso eventName. */
export function groupBetEventsForForm(
  events: BetEventItem[],
  options: OutcomeOption[] = [],
): EventGroupFormValue[] {
  const groups: EventGroupFormValue[] = [];

  for (const event of events) {
    const last = groups[groups.length - 1];
    const parsed = parseStoredOutcome(event.outcome, options);
    const pick: EventPickFormValue = {
      outcome: parsed.label,
      scorerName: parsed.scorerName,
      odds: Number(event.odds),
    };

    if (last && last.eventName === event.eventName) {
      last.picks.push(pick);
    } else {
      groups.push({
        eventName: event.eventName,
        picks: [pick],
      });
    }
  }

  return groups;
}

export function syncPickScorerValidators(
  pick: FormGroup,
  options: OutcomeOption[],
): void {
  const outcome = pick.get('outcome')?.value as string | null | undefined;
  const scorerControl = pick.get('scorerName');
  if (!scorerControl) {
    return;
  }
  if (isScorerOutcomeLabel(outcome, options)) {
    scorerControl.setValidators([Validators.required, Validators.maxLength(120)]);
  } else {
    scorerControl.clearValidators();
    if (scorerControl.value) {
      scorerControl.setValue('', { emitEvent: false });
    }
  }
  scorerControl.updateValueAndValidity({ emitEvent: false });
}

export function syncEventGroupsScorerValidators(
  events: FormArray,
  options: OutcomeOption[],
): void {
  for (const eventControl of events.controls) {
    const picks = eventControl.get('picks') as FormArray | null;
    if (!picks) {
      continue;
    }
    for (const pickControl of picks.controls) {
      syncPickScorerValidators(pickControl as FormGroup, options);
    }
  }
}

export function isValidEventGroups(
  groups: Array<{
    eventName?: string | null;
    picks?: Array<{
      outcome?: string | null;
      odds?: number | null;
      scorerName?: string | null;
    }> | null;
  }>,
  options: OutcomeOption[] = [],
): boolean {
  if (!groups.length) {
    return false;
  }

  return groups.every((group) => {
    if (!group.eventName?.trim()) {
      return false;
    }
    if (!group.picks?.length) {
      return false;
    }
    return group.picks.every((pick) => {
      if (!pick.outcome?.trim() || pick.odds == null || Number(pick.odds) <= 1) {
        return false;
      }
      if (isScorerOutcomeLabel(pick.outcome, options)) {
        return !!pick.scorerName?.trim();
      }
      return true;
    });
  });
}
