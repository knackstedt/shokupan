import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface AppConfig {
    asyncApi: string;
    apiExplorer: string;
}

@Injectable({
    providedIn: 'root'
})
export class ConfigService {
    private http = inject(HttpClient);
    
    readonly config = signal<AppConfig>({
        asyncApi: '/asyncapi',
        apiExplorer: '/explorer'
    });

    async loadConfig(): Promise<void> {
        try {
            const config = await firstValueFrom(
                this.http.get<AppConfig>('/_app/config.json')
            );
            this.config.set(config);
        } catch (err) {
            console.warn('Failed to load config, using defaults:', err);
        }
    }
}
