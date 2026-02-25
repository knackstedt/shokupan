import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GeometryPdfComponent } from './geometry-pdf.component';

describe('GeometryPdfComponent', () => {
  let component: GeometryPdfComponent;
  let fixture: ComponentFixture<GeometryPdfComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GeometryPdfComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GeometryPdfComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
