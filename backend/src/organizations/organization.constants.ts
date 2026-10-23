export const ORG_BET365 = 'bet365';
export const ORG_BETFAIR = 'betfair';

export const ORGANIZATION_DEFINITIONS = [
  { slug: ORG_BET365, name: 'bet365' },
  { slug: ORG_BETFAIR, name: 'Betfair' },
] as const;

export type OrganizationSlug = (typeof ORGANIZATION_DEFINITIONS)[number]['slug'];

export function parseOrganizationSlug(value: unknown): OrganizationSlug {
  return String(value ?? '').trim().toLowerCase() === ORG_BETFAIR
    ? ORG_BETFAIR
    : ORG_BET365;
}
