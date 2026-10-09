import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subject, fromEvent, takeUntil } from 'rxjs';
import { OutcomeOption } from '../../core/models';
import { syncFixedDropdownPanel } from '../vs-select-field/dropdown-panel.util';

@Component({
  selector: 'app-outcome-field',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './outcome-field.component.html',
  styleUrl: './outcome-field.component.scss',
})
export class OutcomeFieldComponent implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroy$ = new Subject<void>();

  @Input({ required: true }) control!: FormControl<string | null>;
  @Input() options: OutcomeOption[] = [];
  @Input() showLabel = true;
  @Input() labelText = 'Esito';
  /** @deprecated Ignorato: usato il menu custom. */
  @Input() listId = '';

  /** Apre l’elenco esiti (es. link «Sfoglia mercati»). */
  openBrowsePanel(): void {
    this.openPanel();
  }

  filteredOptions: OutcomeOption[] = [];
  panelOpen = false;
  panelStyle: Record<string, string> = {};

  ngOnInit(): void {
    this.control.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateFilteredOptions();
      if (this.panelOpen) {
        this.queuePanelPositionSync();
      }
    });

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

  get hasPresetOptions(): boolean {
    return this.options.length > 0;
  }

  onInputFocus(): void {
    this.openPanel();
  }

  onInput(): void {
    this.openPanel();
  }

  private openPanel(): void {
    if (!this.hasPresetOptions) {
      return;
    }
    this.updateFilteredOptions();
    this.panelOpen = true;
    this.queuePanelPositionSync();
  }

  togglePanel(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.hasPresetOptions) {
      return;
    }
    if (this.panelOpen) {
      this.panelOpen = false;
      return;
    }
    this.updateFilteredOptions();
    this.panelOpen = this.filteredOptions.length > 0;
    this.queuePanelPositionSync();
  }

  selectOption(option: OutcomeOption): void {
    this.control.setValue(option.label);
    this.control.markAsDirty();
    this.panelOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.panelOpen = false;
    }
  }

  private updateFilteredOptions(): void {
    const query = (this.control.value ?? '').trim().toLowerCase();
    if (!query) {
      this.filteredOptions = [...this.options];
      return;
    }
    this.filteredOptions = this.options.filter((option) => {
      const label = option.label.toLowerCase();
      const description = (option.description ?? '').toLowerCase();
      return label.includes(query) || description.includes(query);
    });
  }

  private queuePanelPositionSync(): void {
    requestAnimationFrame(() => this.syncPanelPosition());
  }

  private syncPanelPosition(): void {
    this.panelStyle = syncFixedDropdownPanel(
      this.host.nativeElement,
      '.outcome-field__control',
      { matchAnchorWidth: true },
    );
  }
}
