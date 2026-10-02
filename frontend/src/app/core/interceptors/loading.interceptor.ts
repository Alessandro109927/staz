import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PageLoadingService } from '../services/page-loading.service';

function shouldTrackRequest(url: string): boolean {
  if (!url.startsWith(environment.apiUrl)) {
    return false;
  }
  if (url.includes('/teams/search')) {
    return false;
  }
  return true;
}

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const pageLoading = inject(PageLoadingService);
  const track = shouldTrackRequest(req.url);

  if (track) {
    pageLoading.begin();
  }

  return next(req).pipe(
    finalize(() => {
      if (track) {
        pageLoading.end();
      }
    }),
  );
};
