import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OrganizationService } from '../services/organization.service';

/** Scalata e Scout Multigol restano solo sull'organizzazione bet365. */
export const bet365FeaturesGuard: CanActivateFn = () => {
  const organizations = inject(OrganizationService);
  const router = inject(Router);
  return organizations.slug() === 'bet365'
    ? true
    : router.createUrlTree(['/dashboard']);
};
