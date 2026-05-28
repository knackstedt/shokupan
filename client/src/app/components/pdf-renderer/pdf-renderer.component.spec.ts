import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PDFRendererComponent } from './pdf-renderer.component';

describe('PDFRendererComponent', () => {
  let component: PDFRendererComponent;
  let fixture: ComponentFixture<PDFRendererComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PDFRendererComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PDFRendererComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
