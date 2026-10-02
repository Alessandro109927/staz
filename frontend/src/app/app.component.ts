import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PageLoadingService } from './core/services/page-loading.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly pageLoading = inject(PageLoadingService);
}
