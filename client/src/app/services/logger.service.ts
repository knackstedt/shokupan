import { Injectable, isDevMode } from '@angular/core';

/**
 * Logging service that only logs in development mode.
 * In production, logs are suppressed to avoid exposing internal state.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
    private readonly isDev = isDevMode();

    log(...args: any[]): void {
        if (this.isDev) {
            console.log(...args);
        }
    }

    warn(...args: any[]): void {
        if (this.isDev) {
            console.warn(...args);
        }
    }

    error(...args: any[]): void {
        console.error(...args);
    }

    debug(...args: any[]): void {
        if (this.isDev) {
            console.debug(...args);
        }
    }
}
