import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  forwardRef,
  inject,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  fromEvent,
  of,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { TeamOption } from '../../core/models';
import { pickTeamLogo } from './team-logo.util';
import { syncFixedDropdownPanel } from '../vs-select-field/dropdown-panel.util';

@Component({
  selector: 'app-team-search-field',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './team-search-field.component.html',
  styleUrl: './team-search-field.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TeamSearchFieldComponent),
      multi: true,
    },
  ],
})
export class TeamSearchFieldComponent
  implements ControlValueAccessor, OnInit, OnDestroy
{
  private readonly api = inject(ApiService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroy$ = new Subject<void>();

  @Input() label = 'Squadra';
  @Input() placeholder = 'Cerca squadra…';
  @Input() variant: 'default' | 'match' = 'default';
  @Input() side: 'home' | 'away' = 'home';
  @Input() inputId = `team-search-${Math.random().toString(36).slice(2, 9)}`;

  searchControl = new FormControl('', { nonNullable: true });
  options: TeamOption[] = [];
  panelOpen = false;
  loading = false;
  searchError: string | null = null;
  selectedLogoUrl: string | null = null;
  panelStyle: Record<string, string> = {};

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private disabled = false;

  ngOnInit(): void {
    this.searchControl.valueChanges
      .pipe(
        tap((term) => {
          this.onChange(term.trim());
          if (!term.trim()) {
            this.selectedLogoUrl = null;
          }
        }),
        debounceTime(280),
        distinctUntilChanged(),
        tap(() => {
          this.searchError = null;
        }),
        switchMap((term) => {
          const q = term.trim();
          if (q.length < 2) {
            this.options = [];
            this.loading = false;
            this.panelOpen = false;
            return of([]);
          }
          return this.runSearch(q);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    fromEvent(document, 'scroll', { capture: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.panelOpen) {
          this.syncPanelPosition();
        }
      });

    fromEvent(window, 'resize')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.panelOpen) {
          this.syncPanelPosition();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  writeValue(value: string | null): void {
    const text = value ?? '';
    if (this.searchControl.value !== text) {
      this.searchControl.setValue(text, { emitEvent: false });
    }
    this.resolveLogoForName(text);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled) {
      this.searchControl.disable({ emitEvent: false });
    } else {
      this.searchControl.enable({ emitEvent: false });
    }
  }

  onFocus(): void {
    if (this.options.length > 0 || this.searchError) {
      this.panelOpen = true;
      this.queuePanelPositionSync();
    }
  }

  onBlur(): void {
    this.onTouched();
  }

  private runSearch(q: string) {
    this.loading = true;
    return this.api.searchTeams(q).pipe(
      tap({
        next: (teams) => {
          this.options = teams;
          this.loading = false;
          this.panelOpen = teams.length > 0;
          this.searchError = null;
          this.queuePanelPositionSync();
        },
        error: (err) => {
          this.options = [];
          this.loading = false;
          this.panelOpen = false;
          this.searchError =
            err?.error?.message ??
            'Ricerca squadre non disponibile. Riprova tra poco.';
        },
      }),
    );
  }

  selectTeam(team: TeamOption): void {
    this.searchControl.setValue(team.name);
    this.onChange(team.name);
    this.selectedLogoUrl = team.logoUrl;
    this.panelOpen = false;
    this.onTouched();
  }

  private resolveLogoForName(name: string): void {
    const q = name.trim();
    if (q.length < 2) {
      this.selectedLogoUrl = null;
      return;
    }

    this.api
      .searchTeams(q)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe({
        next: (teams) => {
          this.selectedLogoUrl = pickTeamLogo(teams, q);
        },
        error: () => {
          this.selectedLogoUrl = null;
        },
      });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.panelOpen = false;
    }
  }

  private queuePanelPositionSync(): void {
    requestAnimationFrame(() => this.syncPanelPosition());
  }

  private syncPanelPosition(): void {
    this.panelStyle = syncFixedDropdownPanel(
      this.host.nativeElement,
      '.team-search__control',
      { matchAnchorWidth: true },
    );
  }
}
