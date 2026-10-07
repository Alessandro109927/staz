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
import { syncFixedDropdownPanel } from '../vs-select-field/dropdown-panel.util';
import type { VsSelectOption } from '../vs-select-field/vs-select-field.component';

@Component({
  selector: 'app-vs-multi-select-field',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './vs-multi-select-field.component.html',
  styleUrl: './vs-multi-select-field.component.scss',
})
export class VsMultiSelectFieldComponent implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroy$ = new Subject<void>();

  @Input() label = '';
  @Input() placeholder = 'Tutti';
  @Input({ required: true }) control!: FormControl<string[]>;
  @Input({ required: true }) options: VsSelectOption[] = [];

  panelOpen = false;
  panelStyle: Record<string, string> = {};

  ngOnInit(): void {
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

  get displayLabel(): string {
    const values = this.control.value ?? [];
    if (!values.length) {
      return this.placeholder;
    }
    if (values.length === 1) {
      return this.options.find((o) => o.value === values[0])?.label ?? values[0];
    }
    return `${values.length} selezionati`;
  }

  isSelected(value: string): boolean {
    return (this.control.value ?? []).includes(value);
  }

  togglePanel(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.panelOpen) {
      this.panelOpen = false;
      return;
    }
    this.panelOpen = true;
    this.queuePanelPositionSync();
  }

  toggleOption(option: VsSelectOption, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const current = [...(this.control.value ?? [])];
    const idx = current.indexOf(option.value);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(option.value);
    }
    this.control.setValue(current);
    this.control.markAsDirty();
  }

  clearSelection(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.control.setValue([]);
    this.control.markAsDirty();
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
    this.panelStyle = syncFixedDropdownPanel(this.host.nativeElement, '.vs-select', {
      matchAnchorWidth: true,
    });
  }
}
