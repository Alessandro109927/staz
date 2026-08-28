import { Component, HostListener, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { BetChangeService } from '../../core/services/bet-change.service';
import { Capital, User, profitFromCapital, startingCapitalValue } from '../../core/models';
import { NewBetDialogService } from '../../features/new-bet/new-bet-dialog.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
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

  capital: Capital | null = null;
  navOpen = false;
  user: User | null = this.auth.currentUser();

  ngOnInit(): void {
    this.loadCapital();
    this.betChange.changed.subscribe(() => this.loadCapital());
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
