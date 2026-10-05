export function formatMultigolShortDate(utcDate: string): string {
  const d = new Date(utcDate);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
  });
}

export function formatMultigolKickoff(utcDate: string): string {
  const d = new Date(utcDate);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const datePart = d.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
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
