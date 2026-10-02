import { CommonModule } from '@angular/common';
import { Component, HostBinding, Input, OnInit, inject } from '@angular/core';
import { catchError, forkJoin, map, of } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { splitMatchEventName } from '../match-teams-field/match-teams-field.component';
import { pickTeamLogo } from '../team-search/team-logo.util';

@Component({
  selector: 'app-match-teams-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './match-teams-display.component.html',
  styleUrl: './match-teams-display.component.scss',
})
export class MatchTeamsDisplayComponent implements OnInit {
  private readonly api = inject(ApiService);

  @Input({ required: true }) eventName!: string;
  @Input() compact = false;
  /** In riga con esito/quota (es. storico singola pick). */
  @Input() inline = false;

  @HostBinding('class.match-teams-display--inline')
  get hostInlineClass(): boolean {
    return this.inline;
  }

  home = '';
  away = '';
  homeLogo: string | null = null;
  awayLogo: string | null = null;

  ngOnInit(): void {
    const parts = splitMatchEventName(this.eventName);
    this.home = parts.home;
    this.away = parts.away;

    forkJoin({
      homeLogo: this.fetchLogo(parts.home),
      awayLogo: this.fetchLogo(parts.away),
    }).subscribe(({ homeLogo, awayLogo }) => {
      this.homeLogo = homeLogo;
      this.awayLogo = awayLogo;
    });
  }

  private fetchLogo(name: string) {
    const q = name.trim();
    if (q.length < 2) {
      return of(null);
    }
    return this.api.searchTeams(q).pipe(
      map((teams) => pickTeamLogo(teams, q)),
      catchError(() => of(null)),
    );
  }
}
