export function formatMultigolShortDate(utcDate: string): string {
  return formatMultigolFormDate(utcDate);
}

/** Data tabella H2H (es. 24 Maggio 2026). */
export function formatMultigolH2hTableDate(utcDate: string): string {
  const d = new Date(utcDate);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const raw = d.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const parts = raw.split(' ');
  if (parts.length >= 2) {
    parts[1] = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  }
  return parts.join(' ');
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

/** Data/ora compatta per card elenco (es. 10 ott - 15:00). */
export function formatMultigolCardKickoff(utcDate: string): string {
  const d = new Date(utcDate);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const dayMonth = d
    .toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
    .replace('.', '');
  const time = d.toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = dayMonth.split(' ');
  if (parts.length >= 2) {
    parts[1] = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  }
  return `${parts.join(' ')} - ${time}`;
}

/** Età relativa snapshot (es. «12 min fa»). */
export function formatMultigolSyncAge(
  builtAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!builtAtIso?.trim()) {
    return null;
  }
  const builtAt = new Date(builtAtIso).getTime();
  if (!Number.isFinite(builtAt)) {
    return null;
  }
  const minutes = Math.floor(Math.max(0, nowMs - builtAt) / 60_000);
  if (minutes < 1) {
    return 'poco fa';
  }
  if (minutes < 60) {
    return `${minutes} min fa`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h fa`;
  }
  const days = Math.floor(hours / 24);
  return `${days} g fa`;
}

export function formatMultigolDetailSchedule(utcDate: string): string {
  const d = new Date(utcDate);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const rawDate = d.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const dateTokens = rawDate.split(' ');
  if (dateTokens.length >= 2) {
    const month = dateTokens[1];
    dateTokens[1] = month.charAt(0).toUpperCase() + month.slice(1);
  }
  const timePart = d.toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${dateTokens.join(' ')}, ${timePart}`;
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
