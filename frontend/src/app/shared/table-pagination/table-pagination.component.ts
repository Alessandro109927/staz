import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  DEFAULT_TABLE_PAGE_SIZE,
  TABLE_PAGE_SIZE_OPTIONS,
  pageRangeLabel,
  totalPages,
} from '../../core/utils/pagination.util';

@Component({
  selector: 'app-vs-table-pagination',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './table-pagination.component.html',
  styleUrl: './table-pagination.component.scss',
})
export class VsTablePaginationComponent {
  @Input() page = 1;
  @Input() pageSize = DEFAULT_TABLE_PAGE_SIZE;
  @Input() total = 0;
  @Input() ariaLabel = 'Paginazione tabella';
  @Input() pageSizeOptions: readonly number[] = TABLE_PAGE_SIZE_OPTIONS;

  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  get totalPagesCount(): number {
    return totalPages(this.total, this.pageSize);
  }

  get rangeLabel(): string {
    return pageRangeLabel(this.page, this.pageSize, this.total);
  }

  get canGoPrev(): boolean {
    return this.page > 1;
  }

  get canGoNext(): boolean {
    return this.page < this.totalPagesCount;
  }

  goPrev(): void {
    if (!this.canGoPrev) {
      return;
    }
    this.pageChange.emit(this.page - 1);
  }

  goNext(): void {
    if (!this.canGoNext) {
      return;
    }
    this.pageChange.emit(this.page + 1);
  }

  onPageSizeSelect(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (!Number.isFinite(value) || value <= 0 || value === this.pageSize) {
      return;
    }
    this.pageSizeChange.emit(value);
  }
}
