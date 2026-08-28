import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ApiService } from '../services/api.service';

export const capitalGuard: CanActivateFn = () => {
  const api = inject(ApiService);
  const router = inject(Router);

  return api.getCapital().pipe(
    map((capital) => (capital ? true : router.createUrlTree(['/setup']))),
    catchError(() => of(router.createUrlTree(['/setup']))),
  );
};
