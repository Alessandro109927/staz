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
import { syncFixedDropdownPanel } from './dropdown-panel.util';

export type VsSelectOption = {
  value: string;
  label: string;
  description?: string;
};

@Component({
  selector: 'app-vs-select-field',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './vs-select-field.component.html',
  styleUrl: './vs-select-field.component.scss',
})
export class VsSelectFieldComponent implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroy$ = new Subject<void>();

  @Input() label = '';
  @Input({ required: true }) control!: FormControl<string>;
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
    const value = this.control.value;
    return this.options.find((option) => option.value === value)?.label ?? value ?? '';
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

  selectOption(option: VsSelectOption): void {
    this.control.setValue(option.value);
    this.control.markAsDirty();
    this.panelOpen = false;
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
