import type { MultigolOpportunity, MultigolScoutCompetition } from '../../core/models';

export type MultigolLeaguePresetId =
  | 'tutti'
  | 'serie-it'
  | 'premier-efl'
  | 'la-liga'
  | 'bundesliga'
  | 'ligue-1'
  | 'allsvenskan'
  | 'super-league'
  | 'eredivisie'
  | 'mls';

export type MultigolLeaguePresetDef = {
  id: Exclude<MultigolLeaguePresetId, 'tutti'>;
  label: string;
  emoji: string;
  matches: (competition: MultigolScoutCompetition) => boolean;
};

const areaCodes = (c: MultigolScoutCompetition, ...codes: string[]): boolean => {
  const code = c.areaCode?.trim().toUpperCase() ?? '';
  return codes.some((x) => x.toUpperCase() === code);
};

const areaName = (c: MultigolScoutCompetition, pattern: RegExp): boolean =>
  pattern.test(c.areaName ?? '');

const leagueText = (c: MultigolScoutCompetition): string =>
  `${c.name} ${c.areaName ?? ''}`.toLowerCase();

const nameLike = (c: MultigolScoutCompetition, ...fragments: string[]): boolean => {
  const text = leagueText(c);
  return fragments.some((f) => text.includes(f.toLowerCase()));
};

export const MULTIGOL_LEAGUE_PRESET_DEFS: MultigolLeaguePresetDef[] = [
  {
    id: 'serie-it',
    label: 'Serie A & B',
    emoji: '🇮🇹',
    matches: (c) =>
      (areaCodes(c, 'IT') || areaName(c, /ital/i)) &&
      nameLike(c, 'serie a', 'serie b', 'serie c'),
  },
  {
    id: 'premier-efl',
    label: 'Premier & EFL',
    emoji: '🇬🇧',
    matches: (c) =>
      (areaCodes(c, 'GB', 'ENG') || areaName(c, /england|united kingdom/i)) &&
      nameLike(
        c,
        'premier',
        'championship',
        'league one',
        'league two',
        'efl',
        'national league',
      ),
  },
  {
    id: 'la-liga',
    label: 'La Liga',
    emoji: '🇪🇸',
    matches: (c) =>
      (areaCodes(c, 'ES') || areaName(c, /spain|spagna/i)) &&
      nameLike(c, 'la liga', 'laliga', 'segunda', 'primera división', 'primera division'),
  },
  {
    id: 'bundesliga',
    label: 'Bundesliga',
    emoji: '🇩🇪',
    matches: (c) =>
      (areaCodes(c, 'DE') || areaName(c, /germany|germania/i)) &&
      nameLike(c, 'bundesliga', '3. liga', '2. bundesliga'),
  },
  {
    id: 'ligue-1',
    label: 'Ligue 1',
    emoji: '🇫🇷',
    matches: (c) =>
      (areaCodes(c, 'FR') || areaName(c, /france|francia/i)) &&
      nameLike(c, 'ligue 1', 'ligue 2', 'ligue1', 'ligue2'),
  },
  {
    id: 'allsvenskan',
    label: 'Allsvenskan',
    emoji: '🇸🇪',
    matches: (c) =>
      (areaCodes(c, 'SE') || areaName(c, /sweden|svezia/i)) &&
      nameLike(c, 'allsvenskan', 'superettan'),
  },
  {
    id: 'super-league',
    label: 'Super League',
    emoji: '🇨🇭',
    matches: (c) =>
      nameLike(c, 'super league', 'superliga') &&
      (areaCodes(c, 'CH', 'GR') ||
        areaName(c, /switzerland|svizzera|greece|grecia/i)),
  },
  {
    id: 'eredivisie',
    label: 'Eredivisie',
    emoji: '🇳🇱',
    matches: (c) =>
      (areaCodes(c, 'NL') || areaName(c, /netherlands|olanda|paesi bassi/i)) &&
      nameLike(c, 'eredivisie', 'eerste divisie'),
  },
  {
    id: 'mls',
    label: 'MLS',
    emoji: '🇺🇸',
    matches: (c) =>
      (areaCodes(c, 'US') || areaName(c, /united states|usa|stati uniti/i)) &&
      nameLike(c, 'mls', 'major league soccer'),
  },
];

export function leagueKeysForPreset(
  presetId: Exclude<MultigolLeaguePresetId, 'tutti'>,
  competitions: MultigolScoutCompetition[],
): string[] {
  const def = MULTIGOL_LEAGUE_PRESET_DEFS.find((p) => p.id === presetId);
  if (!def) {
    return [];
  }
  return competitions.filter(def.matches).map((c) => c.key);
}

export function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const v of a) {
    if (!b.has(v)) {
      return false;
    }
  }
  return true;
}

export function activeLeaguePresetId(
  selectedLeagueKeys: ReadonlySet<string>,
  selectedNationKeys: ReadonlySet<string>,
  competitions: MultigolScoutCompetition[],
): MultigolLeaguePresetId | null {
  if (selectedNationKeys.size === 0 && selectedLeagueKeys.size === 0) {
    return 'tutti';
  }
  if (selectedNationKeys.size > 0) {
    return null;
  }
  for (const def of MULTIGOL_LEAGUE_PRESET_DEFS) {
    const keys = new Set(leagueKeysForPreset(def.id, competitions));
    if (keys.size > 0 && setsEqual(selectedLeagueKeys, keys)) {
      return def.id;
    }
  }
  return null;
}

export function countItemsInLeagueKeys(
  leagueKeys: ReadonlySet<string>,
  allItems: MultigolOpportunity[],
  resolveLeagueKey: (item: MultigolOpportunity) => string,
): number {
  if (leagueKeys.size === 0) {
    return allItems.length;
  }
  return allItems.filter((item) => leagueKeys.has(resolveLeagueKey(item))).length;
}

export function presetMatchCount(
  presetId: MultigolLeaguePresetId,
  competitions: MultigolScoutCompetition[],
  allItems: MultigolOpportunity[],
  resolveLeagueKey: (item: MultigolOpportunity) => string,
): number {
  if (presetId === 'tutti') {
    return allItems.length;
  }
  const keys = new Set(leagueKeysForPreset(presetId, competitions));
  return countItemsInLeagueKeys(keys, allItems, resolveLeagueKey);
}

export function visibleLeaguePresets(
  competitions: MultigolScoutCompetition[],
): MultigolLeaguePresetDef[] {
  return MULTIGOL_LEAGUE_PRESET_DEFS.filter(
    (def) => leagueKeysForPreset(def.id, competitions).length > 0,
  );
}
