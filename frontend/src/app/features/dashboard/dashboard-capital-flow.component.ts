import { DecimalPipe } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-dashboard-capital-flow',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <span class="dashboard-capital-flow">
      <span class="dashboard-capital-flow__value">€ {{ from | number: '1.0-0' }}</span>
      <svg
        class="dashboard-capital-flow__arrow"
        width="18"
        height="12"
        viewBox="0 0 18 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M1 6H14M14 6L9.5 1.5M14 6L9.5 10.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="dashboard-capital-flow__value">€ {{ to | number: '1.0-0' }}</span>
    </span>
  `,
  styles: [
    `
      .dashboard-capital-flow {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-variant-numeric: tabular-nums;
      }

      .dashboard-capital-flow__arrow {
        flex-shrink: 0;
        color: inherit;
        opacity: 0.85;
      }
    `,
  ],
})
export class DashboardCapitalFlowComponent {
  @Input({ required: true }) from!: number;
  @Input({ required: true }) to!: number;
}
