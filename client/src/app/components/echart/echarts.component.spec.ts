import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EChartComponent } from './echarts.component';

describe('EChartComponent', () => {
    let component: EChartComponent;
    let fixture: ComponentFixture<EChartComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [EChartComponent]
        })
            .compileComponents();

        fixture = TestBed.createComponent(EChartComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
