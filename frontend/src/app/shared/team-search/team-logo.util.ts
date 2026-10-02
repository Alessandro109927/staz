import { TeamOption } from '../../core/models';

export function pickTeamLogo(teams: TeamOption[], name: string): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) {
    return null;
  }
  const exact = teams.find((team) => team.name.toLowerCase() === needle);
  if (exact) {
    return exact.logoUrl;
  }
  const partial = teams.find((team) => team.name.toLowerCase().includes(needle));
  return partial?.logoUrl ?? teams[0]?.logoUrl ?? null;
}
