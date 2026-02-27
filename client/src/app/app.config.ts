import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';

/**
 * Shokupan-branded PrimeNG preset.
 * Primary: #FFB380 (Warm Filament)
 * Surface-dark: #1A1614 (Oven Depth)
 */
const ShokupanPreset = definePreset(Aura, {
  semantic: {
    primary: {
      // Warm Filament range derived from #FFB380
      50: '#fff5ee',
      100: '#ffe8d6',
      200: '#ffd0ad',
      300: '#ffbe85',
      400: '#FFB380',
      500: '#ff9c5a',
      600: '#e07a36',
      700: '#b85c20',
      800: '#8c4114',
      900: '#5e2a0b',
      950: '#3b1705',
    },
  },
  colorScheme: {
    dark: {
      surface: {
        0: '#ffffff',
        50: '#2f2623',
        100: '#2a2421',
        200: '#241f1c',
        300: '#1e1a18',
        400: '#1a1614',
        500: '#161310',
        600: '#11100e',
        700: '#0e0d0b',
        800: '#0a0908',
        900: '#060605',
        950: '#030302',
      },
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: ShokupanPreset,
        options: {
          darkModeSelector: '.dark',
          cssLayer: { name: 'primeng', order: 'tailwind-base, primeng, tailwind-utilities' },
        },
      },
    }),
    MessageService,
    ConfirmationService,
    provideHttpClient(withFetch()),
  ],
};
