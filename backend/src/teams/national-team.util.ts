/** ISO / BSD country_code → nomi comuni (IT + EN) per ricerca nazionali. */
export const NATIONAL_TEAM_QUERY_TO_CODE: Record<string, string> = {
  albania: 'AL',
  algeria: 'DZ',
  argentina: 'AR',
  australia: 'AU',
  austria: 'AT',
  belgio: 'BE',
  belgium: 'BE',
  bosnia: 'BA',
  brazil: 'BR',
  brasile: 'BR',
  bulgaria: 'BG',
  canada: 'CA',
  cile: 'CL',
  chile: 'CL',
  cina: 'CN',
  china: 'CN',
  colombia: 'CO',
  corea: 'KR',
  croazia: 'HR',
  croatia: 'HR',
  danimarca: 'DK',
  denmark: 'DK',
  ecuador: 'EC',
  egitt: 'EG',
  egypt: 'EG',
  inghilterra: 'EN',
  england: 'EN',
  estonia: 'EE',
  finlandia: 'FI',
  finland: 'FI',
  francia: 'FR',
  france: 'FR',
  galles: 'WA',
  wales: 'WA',
  germania: 'DE',
  germany: 'DE',
  grecia: 'GR',
  greece: 'GR',
  irlanda: 'IE',
  ireland: 'IE',
  'irlanda del nord': 'NX',
  'northern ireland': 'NX',
  islanda: 'IS',
  iceland: 'IS',
  israel: 'IL',
  israele: 'IL',
  italia: 'IT',
  italy: 'IT',
  giappone: 'JP',
  japan: 'JP',
  kosovo: 'XK',
  lettonia: 'LV',
  lituania: 'LT',
  luxembourg: 'LU',
  lussemburgo: 'LU',
  macedonia: 'MK',
  marocco: 'MA',
  morocco: 'MA',
  messico: 'MX',
  mexico: 'MX',
  norvegia: 'NO',
  norway: 'NO',
  olanda: 'NL',
  netherlands: 'NL',
  'paesi bassi': 'NL',
  polonia: 'PL',
  poland: 'PL',
  portogallo: 'PT',
  portugal: 'PT',
  'repubblica ceca': 'CZ',
  'czech republic': 'CZ',
  romania: 'RO',
  russia: 'RU',
  scozia: 'SX',
  scotland: 'SX',
  senegal: 'SN',
  serbia: 'RS',
  slovakia: 'SK',
  slovenia: 'SI',
  spagna: 'ES',
  spain: 'ES',
  'stati uniti': 'US',
  usa: 'US',
  'united states': 'US',
  'sud africa': 'ZA',
  'south africa': 'ZA',
  svezia: 'SE',
  sweden: 'SE',
  svizzera: 'CH',
  switzerland: 'CH',
  tunisia: 'TN',
  turchia: 'TR',
  turkey: 'TR',
  turkiye: 'TR',
  ucraina: 'UA',
  ukraine: 'UA',
  ungheria: 'HU',
  hungary: 'HU',
  uruguay: 'UY',
  venezuela: 'VE',
};

const YOUTH_OR_RESERVE =
  /\b(U\d{1,2}|U-\d{1,2}|Under-\d{1,2}|Olympic|Olympics|Futuro|Primavera|Berretti|Giovanili)\b|(?:\bII\b|\bIII\b|\bB\s+Team\b)/i;

const CLUB_HINT =
  /\b(FC|CF|AC|AS|SC|SS|US|CD|SD|FK|SK|BK|IF|FF|Calcio|United|City|Real|Inter|Juventus|Roma|Lazio|Milan|Napoli|Torino|Sporting|Athletic|Club|Wanderers|Rovers|Albion)\b/i;

/** `all` = club e nazionali insieme (default); filtri opzionali per uso interno */
export type TeamSearchKind = 'club' | 'national' | 'all';

export function resolveNationalCountryCode(query: string): string | null {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) {
    return null;
  }
  if (NATIONAL_TEAM_QUERY_TO_CODE[normalized]) {
    return NATIONAL_TEAM_QUERY_TO_CODE[normalized];
  }
  for (const [label, code] of Object.entries(NATIONAL_TEAM_QUERY_TO_CODE)) {
    if (label.startsWith(normalized) || normalized.startsWith(label)) {
      return code;
    }
  }
  return null;
}

export function isLikelyNationalTeam(name: string, countryName: string | null): boolean {
  if (YOUTH_OR_RESERVE.test(name)) {
    return false;
  }
  if (CLUB_HINT.test(name)) {
    return false;
  }
  if (!countryName) {
    return false;
  }
  const n = normalizeName(name);
  const c = normalizeName(countryName);
  if (n === c) {
    return true;
  }
  if (n === 'turkiye' && c === 'turkey') {
    return true;
  }
  if (n === 'usa' && c.includes('united states')) {
    return true;
  }
  if (c.length >= 4 && n === c) {
    return true;
  }
  return false;
}

export function filterTeamsByKind<
  T extends { name: string; countryName: string | null },
>(teams: T[], kind: TeamSearchKind): T[] {
  if (kind === 'all') {
    return teams;
  }
  return teams.filter((team) => {
    const national = isLikelyNationalTeam(team.name, team.countryName);
    return kind === 'national' ? national : !national;
  });
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}
