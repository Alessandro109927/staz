import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { TeamSearchFieldComponent } from '../team-search/team-search-field.component';

const MATCH_SEPARATOR = ' - ';

export function splitMatchEventName(eventName: string): { home: string; away: string } {
  const trimmed = eventName.trim();
  if (!trimmed) {
    return { home: '', away: '' };
  }
  const idx = trimmed.indexOf(MATCH_SEPARATOR);
  if (idx === -1) {
    return { home: trimmed, away: '' };
  }
  return {
    home: trimmed.slice(0, idx).trim(),
    away: trimmed.slice(idx + MATCH_SEPARATOR.length).trim(),
  };
}

export function buildMatchEventName(home: string, away: string): string {
  const h = home.trim();
  const a = away.trim();
  if (h && a) {
    return `${h}${MATCH_SEPARATOR}${a}`;
  }
  return h || a;
}

@Component({
  selector: 'app-match-teams-field',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TeamSearchFieldComponent],
  templateUrl: './match-teams-field.component.html',
  styleUrl: './match-teams-field.component.scss',
})
export class MatchTeamsFieldComponent implements OnInit, OnDestroy {
  @Input({ required: true }) group!: FormGroup;

  homeTeam = '';
  awayTeam = '';

  private readonly destroy$ = new Subject<void>();
  private syncingFromEventName = false;

  ngOnInit(): void {
    const eventNameControl = this.group.get('eventName');
    if (!eventNameControl) {
      return;
    }

    const initial = splitMatchEventName(String(eventNameControl.value ?? ''));
    this.homeTeam = initial.home;
    this.awayTeam = initial.away;

    eventNameControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      if (this.syncingFromEventName) {
        return;
      }
      const parts = splitMatchEventName(String(value ?? ''));
      this.homeTeam = parts.home;
      this.awayTeam = parts.away;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onHomeChange(value: string): void {
    this.homeTeam = value;
    this.syncEventName();
  }

  onAwayChange(value: string): void {
    this.awayTeam = value;
    this.syncEventName();
  }

  private syncEventName(): void {
    const control = this.group.get('eventName');
    if (!control) {
      return;
    }
    const next = buildMatchEventName(this.homeTeam, this.awayTeam);
    this.syncingFromEventName = true;
    control.setValue(next);
    control.markAsDirty();
    control.updateValueAndValidity();
    this.syncingFromEventName = false;
  }
}
