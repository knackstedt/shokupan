import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, Output, ViewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ECElementEvent, ECharts, EChartsOption } from 'echarts';
import { ThemeService } from '../../services/theme.service';

declare const echarts: any;

// Watch for print actions and tell echart to resize and fix the background color
window.matchMedia('print').addEventListener("change", () =>
    EChartComponent._selfInstances.forEach(instance => {
        const chart = instance.chart;
        if (!chart) return;

        chart.resize();
        chart.setOption({
            // All echarts will have the same background color based on the theme.
            // We can get more specific in the future, but this is pretty complex to work around.
            backgroundColor: document.body.classList.contains("dark") ? "#25282a" : "#dddede",
            series: {
                zoom: 1
            }
        });
    }));

// Clear the print styles back to normal viewing
window.matchMedia('screen').addEventListener("change", () =>
    EChartComponent._selfInstances.forEach(instance => instance.chart?.resize())
);

window.addEventListener("focus", () => {
    EChartComponent._selfInstances.forEach(instance => instance.chart?.resize());
});

@Component({
    selector: 'echart',
    templateUrl: './echarts.component.html',
    styleUrls: ['./echarts.component.scss'],
    imports: [
        MatIconModule
    ],
    providers: [],
    standalone: true
})
export class EChartComponent implements AfterViewInit, OnDestroy {
    @ViewChild('chartContainer') chartContainer!: ElementRef<HTMLDivElement>;
    chart!: ECharts;

    private _configuration!: EChartsOption;
    @Input("config") set configuration(config: EChartsOption) {
        this._configuration = config;
        if (this.chart) {
            this.zone.runOutsideAngular(() => {
                this.chart.setOption(config, { replaceMerge: ['series', 'xAxis', 'yAxis'] });
            });
        }
    };
    get configuration() { return this._configuration; }

    private _data: any;
    @Input("data") set data(data: any) {
        this._data = data;
        if (data && this.chart) {
            this.zone.runOutsideAngular(() => {
                this.chart.setOption({ series: data });
            });
        }
    }

    @Input() dataExists: boolean = true;

    @Output() load = new EventEmitter<ECharts>();
    @Output() click = new EventEmitter<ECElementEvent>();

    static _selfInstances: EChartComponent[] = [];

    constructor(
        private readonly theme: ThemeService,
        private readonly zone: NgZone
    ) { }

    ngAfterViewInit() {
        console.log('[EChartComponent] ngAfterViewInit triggered. Element:', this.chartContainer?.nativeElement);
        EChartComponent._selfInstances.push(this);
        if (this.dataExists && this.chartContainer) {
            this.zone.runOutsideAngular(() => {
                try {
                    // console.log('[EChartComponent] Initializing ECharts using window global...');
                    if (typeof echarts === 'undefined') {
                        console.error('[EChartComponent] FATAL: window.echarts is undefined! The angular.json scripts bundle did not load correctly.');
                        return;
                    }
                    this.chart = echarts.init(this.chartContainer.nativeElement);
                    if (this._configuration) {
                        this.chart.setOption(this._configuration);
                    }
                    if (this._data) {
                        this.chart.setOption({ series: this._data });
                    }
                    this.chart.on('click', evt => {
                        this.zone.run(() => this.click.next(evt));
                    });
                    this.zone.run(() => this.load.next(this.chart));
                    console.log('[EChartComponent] Successfully initialized ECharts instance:', this.chart.id);
                } catch (err) {
                    console.error('[EChartComponent] Crashed during initialization!', err);
                }
            });
        }
    }

    ngOnDestroy() {
        EChartComponent._selfInstances.splice(EChartComponent._selfInstances.indexOf(this), 1);
        if (this.chart) {
            this.chart.dispose();
        }
    }
}
