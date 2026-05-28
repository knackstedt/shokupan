import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { AuthUser, OAuthProvider } from '../types';

/**
 * AuthService – handles OAuth login redirect and JWT decoding.
 *
 * Security notes:
 *  - JWT is issued by the server (via arctic + jose). The auth_token cookie is
 *    HttpOnly so JS cannot read it. Instead, the server should expose a
 *    GET /auth/me endpoint that returns the decoded user. We call that on init.
 *  - No inline innerHTML or dangerouslySetInnerHTML present.
 *  - Login is a simple server redirect – no client-side secret.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
    private http = inject(HttpClient);
    private messageService = inject(MessageService);

    /** Currently signed-in user, or null if not authenticated. */
    readonly user = signal<AuthUser | null>(null);
    readonly loading = signal(true);
    readonly authError = signal<string | null>(null);

    constructor() {
        this.initUser();
    }

    /**
     * Fetch the current session from the server.
     * Server reads the auth_token HttpOnly cookie and returns user info.
     */
    async initUser(): Promise<void> {
        try {
            const data = await firstValueFrom(
                this.http.get<AuthUser>('/auth/me', { withCredentials: true })
            );
            this.user.set(data);
            this.authError.set(null);
        } catch (error: any) {
            this.user.set(null);
            const errorMsg = error?.error?.message || error?.message || 'Authentication failed';
            this.authError.set(errorMsg);
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Redirect the browser to the server-side OAuth login endpoint.
     * The server handles the full OAuth flow and sets the auth_token cookie.
     */
    login(provider: OAuthProvider): void {
        window.open(`/auth/${provider}/login`, '_self');
    }

    /**
     * Clear the auth cookie by hitting the server logout endpoint,
     * then reset local state.
     */
    async logout(): Promise<void> {
        try {
            await firstValueFrom(
                this.http.post('/auth/logout', {}, { withCredentials: true })
            );
            this.messageService.add({
                severity: 'success',
                summary: 'Logged Out',
                detail: 'You have been successfully logged out',
                life: 3000
            });
        } catch (error: any) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Logout Warning',
                detail: 'Logout request failed, but local session cleared',
                life: 3000
            });
        }
        this.user.set(null);
        this.authError.set(null);
    }

    get isAuthenticated(): boolean {
        return this.user() !== null;
    }
}
