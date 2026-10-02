import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/services/api.service';
import {
  VsSelectFieldComponent,
  VsSelectOption,
} from '../../shared/vs-select-field/vs-select-field.component';
import { BetChangeService } from '../../core/services/bet-change.service';
import { MonthOption, MonthlyReport, OddsRangeKpi } from '../../core/models';
import { OddsRangeKpiDonutComponent } from '../../shared/components/odds-range-kpi-donut/odds-range-kpi-donut.component';

@Component({
  selector: 'app-monthly-report',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    VsSelectFieldComponent,
    OddsRangeKpiDonutComponent,
  ],
  templateUrl: './monthly-report.component.html',
  styleUrl: './monthly-report.component.scss',
})
export class MonthlyReportComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly betChange = inject(BetChangeService);

  months: MonthOption[] = [];
  report: MonthlyReport | null = null;
  loading = true;

  monthControl = new FormControl<string>('', { nonNullable: true });

  ngOnInit(): void {
    this.loadMonths();
    this.monthControl.valueChanges.subscribe((value) => {
      if (value) {
        this.loadReport(value);
      }
    });
    this.betChange.changed.subscribe(() => this.loadMonths());
  }

  monthLabel(option: MonthOption): string {
    const date = new Date(option.year, option.month - 1, 1);
    return date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  }

  get monthSelectOptions(): VsSelectOption[] {
    return this.months.map((option) => ({
      value: this.monthKey(option),
      label: this.monthLabel(option),
    }));
  }

  hasOddsRangeActivity(kpi: OddsRangeKpi): boolean {
    return kpi.total > 0;
  }

  get activeOddsRanges(): OddsRangeKpi[] {
    return this.report?.oddsRanges.filter((kpi) => this.hasOddsRangeActivity(kpi)) ?? [];
  }

  private loadMonths(): void {
    this.loading = true;
    this.api.getAvailableMonths().subscribe({
      next: (months) => {
        this.months = months;
        this.loading = false;

        if (!months.length) {
          this.report = null;
          this.monthControl.setValue('', { emitEvent: false });
          return;
        }

        const currentValue = this.monthControl.value;
        const currentExists = months.some(
          (item) => this.monthKey(item) === currentValue,
        );

        if (!currentExists) {
          this.monthControl.setValue(this.monthKey(months[0]));
        } else if (currentValue) {
          this.loadReport(currentValue);
        }
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  private loadReport(key: string): void {
    const [year, month] = key.split('-').map(Number);
    this.api.getMonthlyReport(year, month).subscribe((report) => {
      this.report = report;
    });
  }

  private monthKey(option: MonthOption): string {
    return `${option.year}-${option.month}`;
  }
}
