export function formatMultigolShortDate(utcDate: string): string {
  return formatMultigolFormDate(utcDate);
}

/** Data partita con **anno** (forma gol, H2H). */
export function formatMultigolFormDate(utcDate: string): string {
  const d = new Date(utcDate);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMultigolMatchdayLabel(
  matchday: number | null | undefined,
  roundLabel?: string | null,
): string | null {
  if (matchday != null && matchday > 0) {
    return `Giornata ${matchday}`;
  }
  const label = roundLabel?.trim();
  return label || null;
}

export function formatMultigolKickoff(utcDate: string): string {
  const d = new Date(utcDate);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const datePart = d.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timePart = d
    .toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(':', '.');
  return `${datePart} ${timePart}`;
}

export function formatMultigolProbabilityPercent(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

export type MultigolEmpiricalSample = {
  empiricalProbabilityPercent: number | null;
  empiricalSampleHits: number;
  empiricalSampleMatches: number;
};

export function formatMultigolEmpiricalPercent(sample: MultigolEmpiricalSample): string | null {
  const { empiricalProbabilityPercent, empiricalSampleMatches } = sample;
  if (empiricalSampleMatches <= 0 || empiricalProbabilityPercent == null) {
    return null;
  }
  const pct = formatMultigolProbabilityPercent(empiricalProbabilityPercent);
  return `${pct}%`;
}
