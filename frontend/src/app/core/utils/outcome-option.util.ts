import { OutcomeOption } from '../models';

export const SCORER_OUTCOME_LABEL = 'Marcatore';
export const SCORER_OUTCOME_SEPARATOR = ' – ';

export function isScorerOutcomeOption(option: OutcomeOption): boolean {
  return (option.kind ?? 'standard') === 'scorer';
}

export function isScorerOutcomeLabel(
  label: string | null | undefined,
  options: OutcomeOption[] = [],
): boolean {
  const trimmed = (label ?? '').trim();
  if (!trimmed) {
    return false;
  }

  const preset = options.find(
    (option) => option.label.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (preset) {
    return isScorerOutcomeOption(preset);
  }

  return trimmed.toLowerCase() === SCORER_OUTCOME_LABEL.toLowerCase();
}

export function formatStoredOutcome(
  label: string,
  scorerName: string | null | undefined,
  options: OutcomeOption[] = [],
): string {
  const trimmedLabel = label.trim();
  if (!isScorerOutcomeLabel(trimmedLabel, options)) {
    return trimmedLabel;
  }
  const name = (scorerName ?? '').trim();
  return name ? `${trimmedLabel}${SCORER_OUTCOME_SEPARATOR}${name}` : trimmedLabel;
}

export function parseStoredOutcome(
  stored: string,
  options: OutcomeOption[] = [],
): { label: string; scorerName: string } {
  for (const option of options) {
    if (!isScorerOutcomeOption(option)) {
      continue;
    }
    const prefix = `${option.label}${SCORER_OUTCOME_SEPARATOR}`;
    if (stored.startsWith(prefix)) {
      return {
        label: option.label,
        scorerName: stored.slice(prefix.length).trim(),
      };
    }
    if (stored === option.label) {
      return { label: option.label, scorerName: '' };
    }
  }

  const trimmed = stored.trim();
  const sepIndex = trimmed.indexOf(SCORER_OUTCOME_SEPARATOR);
  if (sepIndex > 0) {
    const labelPart = trimmed.slice(0, sepIndex).trim();
    if (labelPart.toLowerCase() === SCORER_OUTCOME_LABEL.toLowerCase()) {
      return {
        label: labelPart,
        scorerName: trimmed.slice(sepIndex + SCORER_OUTCOME_SEPARATOR.length).trim(),
      };
    }
  }
  if (trimmed.toLowerCase() === SCORER_OUTCOME_LABEL.toLowerCase()) {
    return { label: trimmed, scorerName: '' };
  }

  return { label: stored, scorerName: '' };
}
