import { Component, DestroyRef, HostListener, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import { Capital, User, profitFromCapital, startingCapitalValue } from '../../core/models';
import { NewBetDialogService } from '../../features/new-bet/new-bet-dialog.service';
import { ApiFootballUsageService } from '../../core/services/api-football-usage.service';
import type { ApiFootballUsage } from '../../core/models';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatTooltipModule,
    DecimalPipe,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly newBetDialog = inject(NewBetDialogService);
  private readonly betChange = inject(BetChangeService);
  private readonly apiFootballUsage = inject(ApiFootballUsageService);
  private readonly destroyRef = inject(DestroyRef);

  capital: Capital | null = null;
  readonly apiUsage = this.apiFootballUsage.usage;
  navOpen = false;
  /** Solo desktop: rail stretta con sole icone. */
  sidebarCollapsed = false;
  user: User | null = this.auth.currentUser();

  private static readonly SIDEBAR_COLLAPSED_KEY = 'staz.sidebar.collapsed';

  ngOnInit(): void {
    if (typeof localStorage !== 'undefined') {
      this.sidebarCollapsed =
        localStorage.getItem(ShellComponent.SIDEBAR_COLLAPSED_KEY) === '1';
    }
    this.loadCapital();
    this.betChange.changed.subscribe(() => this.loadCapital());
    this.apiFootballUsage.refresh();
    interval(20_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.apiFootballUsage.refresh());
  }

  apiUsageTitle(usage: ApiFootballUsage): string {
    const parts = [
      `Chiamate API-Football da questo server: ${usage.sessionCalls}.`,
    ];
    if (usage.dailyCurrent != null && usage.dailyLimit != null) {
      parts.push(`Quota giornaliera dashboard: ${usage.dailyCurrent}/${usage.dailyLimit}.`);
    }
    return parts.join(' ');
  }

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth > 1024) {
      this.navOpen = false;
    }
  }

  toggleNav(): void {
    this.navOpen = !this.navOpen;
  }

  closeNav(): void {
    this.navOpen = false;
  }

  toggleSidebarCollapse(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        ShellComponent.SIDEBAR_COLLAPSED_KEY,
        this.sidebarCollapsed ? '1' : '0',
      );
    }
  }

  openNewBet(): void {
    this.closeNav();
    this.newBetDialog.open().subscribe();
  }

  logout(): void {
    this.closeNav();
    this.auth.logout();
  }

  private loadCapital(): void {
    this.api.getCapital().subscribe((capital) => (this.capital = capital));
  }

  get profit(): number {
    if (!this.capital) {
      return 0;
    }
    return profitFromCapital(this.capital);
  }

  get roi(): number {
    if (!this.capital) {
      return 0;
    }
    const starting = startingCapitalValue(this.capital);
    if (starting <= 0) {
      return 0;
    }
    return ((Number(this.capital.currentCapital) - starting) / starting) * 100;
  }
}
