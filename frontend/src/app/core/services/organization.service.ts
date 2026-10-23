import { Injectable } from '@angular/core';

export type OrganizationSlug = 'bet365' | 'betfair';

export type OrganizationOption = {
  slug: OrganizationSlug;
  label: string;
};

const STORAGE_KEY = 'staz.organization';

@Injectable({ providedIn: 'root' })
export class OrganizationService {
  readonly options: OrganizationOption[] = [
    { slug: 'bet365', label: 'bet365' },
    { slug: 'betfair', label: 'Betfair' },
  ];

  slug(): OrganizationSlug {
    if (typeof localStorage === 'undefined') {
      return 'bet365';
    }
    return localStorage.getItem(STORAGE_KEY) === 'betfair' ? 'betfair' : 'bet365';
  }

  label(): string {
    return this.options.find((option) => option.slug === this.slug())?.label ?? 'bet365';
  }

  select(slug: OrganizationSlug): void {
    if (slug === this.slug() || typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(STORAGE_KEY, slug);
    window.location.assign(slug === 'betfair' ? '/setup' : '/dashboard');
  }
}
