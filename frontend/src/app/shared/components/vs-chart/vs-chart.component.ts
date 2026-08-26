import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

let chartJsReady = false;

function ensureChartJs(): void {
  if (!chartJsReady) {
    Chart.register(...registerables);
    chartJsReady = true;
  }
}

@Component({
  selector: 'app-vs-chart',
  standalone: true,
  template: `<div class="vs-chart" [style.height.px]="height"><canvas #canvas></canvas></div>`,
  styles: [
    `
      .vs-chart {
        position: relative;
        width: 100%;
        min-height: 0;
      }

      canvas {
        display: block;
        width: 100% !important;
        height: 100% !important;
      }
    `,
  ],
})
export class VsChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLCanvasElement>;

  @Input({ required: true }) config!: ChartConfiguration;
  @Input() height = 100;

  private chart?: Chart;

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnChanges(): void {
    this.renderChart();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private renderChart(): void {
    if (!this.canvasRef?.nativeElement || !this.config) {
      return;
    }

    ensureChartJs();
    this.chart?.destroy();

    const canvas = this.canvasRef.nativeElement;
    const config: ChartConfiguration = {
      ...this.config,
      data: {
        labels: [...(this.config.data.labels ?? [])],
        datasets: this.config.data.datasets.map((dataset) => ({ ...dataset })),
      },
      options: this.config.options,
    };
    this.applyCanvasGradients(canvas, config);

    this.chart = new Chart(canvas, config);
  }

  private applyCanvasGradients(
    canvas: HTMLCanvasElement,
    config: ChartConfiguration,
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    for (const dataset of config.data.datasets) {
      const bg = dataset.backgroundColor;
      if (typeof bg !== 'string' || !bg.startsWith('gradient:')) {
        continue;
      }

      const [, from, to] = bg.split(':');
      const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
      gradient.addColorStop(0, from);
      gradient.addColorStop(1, to);
      dataset.backgroundColor = gradient;
    }
  }
}
