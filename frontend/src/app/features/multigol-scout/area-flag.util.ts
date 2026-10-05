/** football-data.org area.code → ISO 3166-1 alpha-2 (o sotto-regione flagcdn). */
const AREA_TO_ISO: Record<string, string> = {
  IT: 'it',
  ITA: 'it',
  ENG: 'gb-eng',
  SCO: 'gb-sct',
  WAL: 'gb-wls',
  NIR: 'gb-nir',
  GBN: 'gb',
  GB: 'gb',
  ESP: 'es',
  ES: 'es',
  DE: 'de',
  DEU: 'de',
  FR: 'fr',
  FRA: 'fr',
  PT: 'pt',
  POR: 'pt',
  NL: 'nl',
  NLD: 'nl',
  BE: 'be',
  BEL: 'be',
  AT: 'at',
  AUT: 'at',
  CH: 'ch',
  CHE: 'ch',
  TR: 'tr',
  TUR: 'tr',
  GR: 'gr',
  GRC: 'gr',
  PL: 'pl',
  POL: 'pl',
  UA: 'ua',
  UKR: 'ua',
  RU: 'ru',
  RUS: 'ru',
  CZ: 'cz',
  CZE: 'cz',
  SK: 'sk',
  SVK: 'sk',
  HU: 'hu',
  HUN: 'hu',
  RO: 'ro',
  ROU: 'ro',
  BG: 'bg',
  BGR: 'bg',
  HR: 'hr',
  HRV: 'hr',
  RS: 'rs',
  SRB: 'rs',
  SI: 'si',
  SVN: 'si',
  DK: 'dk',
  DNK: 'dk',
  SE: 'se',
  SWE: 'se',
  NO: 'no',
  NOR: 'no',
  FI: 'fi',
  FIN: 'fi',
  IE: 'ie',
  IRL: 'ie',
  IS: 'is',
  ISL: 'is',
  US: 'us',
  USA: 'us',
  MX: 'mx',
  MEX: 'mx',
  BR: 'br',
  BRA: 'br',
  AR: 'ar',
  ARG: 'ar',
  CL: 'cl',
  CHL: 'cl',
  CO: 'co',
  COL: 'co',
  JP: 'jp',
  JPN: 'jp',
  KR: 'kr',
  KOR: 'kr',
  CN: 'cn',
  CHN: 'cn',
  AU: 'au',
  AUS: 'au',
  KSA: 'sa',
  AE: 'ae',
  ARE: 'ae',
  IN: 'in',
  IND: 'in',
  ZA: 'za',
  RSA: 'za',
  EG: 'eg',
  EGY: 'eg',
  MA: 'ma',
  MAR: 'ma',
  TN: 'tn',
  TUN: 'tn',
  DZ: 'dz',
  ALG: 'dz',
};

const AREA_NAME_TO_ISO: Record<string, string> = {
  italy: 'it',
  england: 'gb-eng',
  scotland: 'gb-sct',
  wales: 'gb-wls',
  spain: 'es',
  germany: 'de',
  france: 'fr',
  portugal: 'pt',
  netherlands: 'nl',
  belgium: 'be',
  austria: 'at',
  switzerland: 'ch',
  turkey: 'tr',
  greece: 'gr',
  poland: 'pl',
  ukraine: 'ua',
  russia: 'ru',
  'czech republic': 'cz',
  czechia: 'cz',
  slovakia: 'sk',
  hungary: 'hu',
  romania: 'ro',
  bulgaria: 'bg',
  croatia: 'hr',
  serbia: 'rs',
  slovenia: 'si',
  denmark: 'dk',
  sweden: 'se',
  norway: 'no',
  finland: 'fi',
  ireland: 'ie',
  iceland: 'is',
  'united states': 'us',
  usa: 'us',
  mexico: 'mx',
  brazil: 'br',
  argentina: 'ar',
  chile: 'cl',
  colombia: 'co',
  japan: 'jp',
  'south korea': 'kr',
  china: 'cn',
  australia: 'au',
  'saudi arabia': 'sa',
  india: 'in',
  'south africa': 'za',
  egypt: 'eg',
  morocco: 'ma',
  tunisia: 'tn',
  algeria: 'dz',
};

export type AreaFlagView =
  | { kind: 'emoji'; value: string }
  | { kind: 'image'; value: string };

function iso2ToEmoji(iso2: string): string | null {
  const code = iso2.toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) {
    return null;
  }
  const base = 0x1f1e6;
  return [...code]
    .map((char) => String.fromCodePoint(base + char.charCodeAt(0) - 65))
    .join('');
}

function resolveIsoSlug(
  areaCode: string | null | undefined,
  areaName: string | null | undefined,
): string | null {
  const rawCode = areaCode?.trim();
  if (rawCode) {
    const key = rawCode.toUpperCase();
    const mapped = AREA_TO_ISO[key];
    if (mapped) {
      return mapped;
    }
    if (key.length === 2) {
      return key.toLowerCase();
    }
  }
  const name = areaName?.trim().toLowerCase();
  if (name && AREA_NAME_TO_ISO[name]) {
    return AREA_NAME_TO_ISO[name];
  }
  return null;
}

/** Bandiera per chip filtro: emoji (affidabile) o PNG per nazioni UK. */
export function areaFlagView(
  areaCode: string | null | undefined,
  areaName?: string | null,
): AreaFlagView | null {
  const slug = resolveIsoSlug(areaCode, areaName);
  if (!slug) {
    return null;
  }
  if (!slug.includes('-')) {
    const emoji = iso2ToEmoji(slug);
    if (emoji) {
      return { kind: 'emoji', value: emoji };
    }
  }
  return { kind: 'image', value: `https://flagcdn.com/w40/${slug}.png` };
}
