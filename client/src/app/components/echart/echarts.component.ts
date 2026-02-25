import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ECElementEvent, ECharts, EChartsOption } from 'echarts';
import { NGX_ECHARTS_CONFIG, NgxEchartsModule } from 'ngx-echarts';
import { ThemeService } from '../../services/theme.service';

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
        NgxEchartsModule,
        MatIconModule
    ],
    providers: [
        {
            provide: NGX_ECHARTS_CONFIG,
            useFactory: () => ({ echarts: () => import('echarts') })
        },
    ],
    standalone: true
})
export class EChartComponent {
    chart!: ECharts;

    private _configuration!: EChartsOption;
    @Input("config") set configuration(config: EChartsOption) {
        this._configuration = config;
    };
    get configuration() { return this._configuration; }

    private _data: any;
    @Input("data") set data(data: any) {
        if (data) {
            this.chart?.setOption({ series: data });
        }
    }

    @Input() dataExists: boolean = true;

    @Output() load = new EventEmitter<ECharts>();
    @Output() click = new EventEmitter<ECElementEvent>();

    static _selfInstances: EChartComponent[] = [];

    constructor(
        private readonly theme: ThemeService
    ) { }

    ngAfterViewInit() {
        EChartComponent._selfInstances.push(this);
    }

    ngOnDestroy() {
        EChartComponent._selfInstances.splice(EChartComponent._selfInstances.indexOf(this), 1);
    }

    onChartInit(ec: any) {
        this.chart = ec;
        this.chart.on('click', evt => {
            this.click.next(evt);
        });
        this.load.next(ec);
    }
}
