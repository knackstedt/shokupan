import { Component } from '@angular/core';
import { NgxExtendedPdfViewerComponent, NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer'; // Import the module
import { ThemeService } from '../../services/theme.service';

@Component({
    selector: 'app-geometry-pdf',
    imports: [
        NgxExtendedPdfViewerModule
    ],
    templateUrl: './pdf-renderer.component.html',
    styleUrl: './pdf-renderer.component.scss'
})
export class PDFRendererComponent {

    headers: NgxExtendedPdfViewerComponent['httpHeaders'];

    constructor(
        public readonly theme: ThemeService
    ) {
    }
}
