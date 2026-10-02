import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { EventPickFormValue } from './event-form.helpers';

export function createEventPickGroup(
  fb: FormBuilder,
  pick: Partial<EventPickFormValue> = {},
): FormGroup {
  return fb.group({
    outcome: [pick.outcome ?? '', Validators.required],
    scorerName: [pick.scorerName ?? ''],
    odds: [pick.odds ?? 1.75, [Validators.required, Validators.min(1.01)]],
  });
}

export function createEventGroupForm(
  fb: FormBuilder,
  eventName = '',
  picks: Partial<EventPickFormValue>[] = [{}],
): FormGroup {
  return fb.group({
    eventName: [eventName, Validators.required],
    picks: fb.array(picks.map((pick) => createEventPickGroup(fb, pick))),
  });
}
