import { AsyncLocalStorage } from 'async_hooks';
import { IsNull } from 'typeorm';
import { ORG_BET365, OrganizationSlug } from './organization.constants';

export type OrganizationContext = {
  id: number;
  slug: OrganizationSlug;
};

const storage = new AsyncLocalStorage<OrganizationContext>();

export function runWithOrganization<T>(
  context: OrganizationContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

export function currentOrganization(): OrganizationContext {
  const context = storage.getStore();
  if (!context) {
    throw new Error('Contesto organizzazione assente');
  }
  return context;
}

export function organizationIdForCreate(): number {
  return currentOrganization().id;
}

/** bet365 include le righe storiche con organization_id nullo, senza riscriverle. */
export function organizationScope(
  userId: number,
  extra: Record<string, unknown> = {},
): Array<Record<string, unknown>> {
  const { id, slug } = currentOrganization();
  if (slug === ORG_BET365) {
    return [
      { ...extra, userId, organizationId: id },
      { ...extra, userId, organizationId: IsNull() },
    ];
  }
  return [{ ...extra, userId, organizationId: id }];
}

export function applyOrganizationScope(
  query: { andWhere: (sql: string, params?: object) => unknown },
  column: string,
  paramName = 'organizationId',
): void {
  const { id, slug } = currentOrganization();
  if (slug === ORG_BET365) {
    query.andWhere(`(${column} = :${paramName} OR ${column} IS NULL)`, {
      [paramName]: id,
    });
    return;
  }
  query.andWhere(`${column} = :${paramName}`, { [paramName]: id });
}

export function organizationPredicate(column: string, paramIndex: number): string {
  if (currentOrganization().slug === ORG_BET365) {
    return `(${column} = $${paramIndex} OR ${column} IS NULL)`;
  }
  return `${column} = $${paramIndex}`;
}
