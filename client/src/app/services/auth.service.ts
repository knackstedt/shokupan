import { Injectable, signal } from '@angular/core';
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
    /** Currently signed-in user, or null if not authenticated. */
    readonly user = signal<AuthUser | null>(null);
    readonly loading = signal(true);

    constructor() {
        this.initUser();
    }

    /**
     * Fetch the current session from the server.
     * Server reads the auth_token HttpOnly cookie and returns user info.
     */
    async initUser(): Promise<void> {
        try {
            const res = await fetch('/auth/me', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json() as AuthUser;
                this.user.set(data);
            } else {
                this.user.set(null);
            }
        } catch {
            this.user.set(null);
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Redirect the browser to the server-side OAuth login endpoint.
     * The server handles the full OAuth flow and sets the auth_token cookie.
     */
    login(provider: OAuthProvider): void {
        window.location.href = `/auth/${provider}/login`;
    }

    /**
     * Clear the auth cookie by hitting the server logout endpoint,
     * then reset local state.
     */
    async logout(): Promise<void> {
        try {
            await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
        } catch { /* ignore */ }
        this.user.set(null);
    }

    get isAuthenticated(): boolean {
        return this.user() !== null;
    }
}
