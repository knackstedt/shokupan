
import { ShokupanContext } from "../../context";
import { ShokupanRouter } from "../../router";
import type { Shokupan } from "../../shokupan";
import { $isMounted } from "../../util/symbol";
import type { ShokupanPlugin, ShokupanPluginOptions } from "../../util/types";

export interface AuthUser {
    id: string;
    email?: string;
    name?: string;
    picture?: string;
    provider: string;
    permissions?: string[];
    raw?: any;
    [key: string]: any;
}

export interface ProviderConfig {
    /**
     * Client ID
     */
    clientId: string;
    /**
     * Client secret
     */
    clientSecret: string;
    /**
     * Redirect URI
     */
    redirectUri: string; // Must be absolute
    /**
     * Scopes
     */
    scopes?: string[];
    /**
     * Tenant ID (MSFT AD)
     */
    tenantId?: string;
    /**
     * Domain (Auth0, Okta)
     */
    domain?: string;
    /**
     * Team ID (Apple)
     */
    teamId?: string;
    /**
     * Key ID (Apple)
     */
    keyId?: string;
    /**
     * Auth URL (Generic OAuth2)
     */
    authUrl?: string;
    /**
     * Token URL (Generic OAuth2)
     */
    tokenUrl?: string;
    /**
     * User info URL (Generic OAuth2)
     */
    userInfoUrl?: string;
}

export interface AuthConfig {
    /**
     * JWT secret
     */
    jwtSecret: string | Uint8Array;
    /**
     * JWT expiration
     */
    jwtExpiration?: string; // e.g. "2h"
    /**
     * JWT algorithm
     * @default 'HS256'
     */
    jwtAlgorithm?: string;
    /**
     * Cookie options
     */
    cookieOptions?: {
        /**
         * HTTP only
         */
        httpOnly?: boolean;
        /**
         * Secure
         */
        secure?: boolean;
        /**
         * Same site
         */
        sameSite?: "Strict" | "Lax" | "None";
        /**
         * Path
         */
        path?: string;
        /**
         * Max age
         */
        maxAge?: number;
    };
    /**
     * Optional URL to redirect to upon successful login and session creation.
     * If not provided, returns a JSON object with the token.
     */
    successRedirect?: string;
    /**
     * Success callback
     */
    onSuccess?: (user: AuthUser, ctx: ShokupanContext) => Promise<any> | any;
    /**
     * Providers
     */
    providers: {
        github?: ProviderConfig;
        google?: ProviderConfig;
        microsoft?: ProviderConfig;
        apple?: ProviderConfig;
        auth0?: ProviderConfig;
        okta?: ProviderConfig;
        oauth2?: ProviderConfig;
        [key: string]: ProviderConfig | undefined;
    };
}

/**
 * Authentication plugin
 */
export class AuthPlugin extends ShokupanRouter<any> implements ShokupanPlugin {
    private secret: Uint8Array;
    private arctic!: typeof import("arctic");
    private jose!: typeof import("jose");

    constructor(private authConfig: AuthConfig) {
        super();
        this.secret = typeof authConfig.jwtSecret === 'string'
            ? new TextEncoder().encode(authConfig.jwtSecret)
            : authConfig.jwtSecret;
    }

    async onInit(app: Shokupan, options?: ShokupanPluginOptions) {
        // Load dependencies asynchronously
        this.arctic = await import("arctic");
        this.jose = await import("jose");

        // Initialize routes (idempotent — routes are only registered once)
        this.init();

        // Guard against being mounted more than once (e.g. register() called twice)
        if (!(this as any)[$isMounted]) {
            app.mount(options?.path ?? '/', this);
        }
    }

    private getProviderInstance(name: string, p: ProviderConfig) {
        const { GitHub, Google, MicrosoftEntraId, Apple, Auth0, Okta, OAuth2Client } = this.arctic;

        switch (name) {
            case 'github':
                return new GitHub(p.clientId, p.clientSecret, p.redirectUri);
            case 'google':
                return new Google(p.clientId, p.clientSecret, p.redirectUri);
            case 'microsoft':
                return new MicrosoftEntraId(p.tenantId!, p.clientId, p.clientSecret, p.redirectUri);
            case 'apple':
                // TODO: There is a type issue, requires testing.
                return new Apple(
                    p.clientId,
                    p.teamId!,
                    p.keyId!,
                    p.clientSecret as any,
                    p.redirectUri
                );
            case 'auth0':
                return new Auth0(p.domain!, p.clientId, p.clientSecret, p.redirectUri);
            case 'okta':
                return new Okta(p.domain!, p.authUrl, p.clientId, p.clientSecret, p.redirectUri);
            case 'oauth2':
                return new OAuth2Client(p.clientId, p.clientSecret, p.redirectUri);
            default:
                return null;
        }
    }

    private async createSession(user: AuthUser, ctx: ShokupanContext) {
        const alg = this.authConfig.jwtAlgorithm || 'HS256';
        const jwt = await new this.jose.SignJWT({ ...user })
            .setProtectedHeader({ alg })
            .setIssuedAt()
            .setExpirationTime(this.authConfig.jwtExpiration || '24h')
            .sign(this.secret);

        // Set cookie
        const opts = this.authConfig.cookieOptions || {};
        let cookie = `auth_token=${jwt}; Path=${opts.path || '/'}; HttpOnly`;
        if (opts.secure) cookie += '; Secure';
        if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;
        if (opts.maxAge) cookie += `; Max-Age=${opts.maxAge}`;

        ctx.set('Set-Cookie', cookie);

        return jwt;
    }

    private init() {
        // ── Session & Logout endpoints ──────────────────────────────────────────
        /**
         * GET /auth/me
         * Reads and verifies the auth_token cookie and returns the decoded user.
         * Used by the Angular SPA to bootstrap session state on page load.
         * The JWT signature is verified server-side — the client never sees the secret.
         */
        this.get('/auth/me', async (ctx) => {
            const cookieHeader = ctx.req.headers.get('Cookie');
            const token = cookieHeader?.match(/auth_token=([^;]+)/)?.[1];
            if (!token) return ctx.json({ error: 'Unauthenticated' }, 401);
            try {
                const { payload } = await this.jose.jwtVerify(token, this.secret);
                // Return the verified payload directly — no raw token exposure
                return ctx.json(payload);
            } catch {
                return ctx.json({ error: 'Invalid or expired token' }, 401);
            }
        });

        /**
         * POST /auth/logout
         * Clears the auth_token cookie.
         */
        this.post('/auth/logout', (ctx) => {
            ctx.set('Set-Cookie', 'auth_token=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');
            return ctx.json({ ok: true });
        });

        const { generateState, generateCodeVerifier, GitHub, Google, MicrosoftEntraId, Apple, Auth0, Okta, OAuth2Client } = this.arctic;
        const providerEntries = Object.entries(this.authConfig.providers);

        for (let i = 0; i < providerEntries.length; i++) {
            const [providerName, providerConfig] = providerEntries[i];
            if (!providerConfig) continue;

            const provider = this.getProviderInstance(providerName, providerConfig);
            if (!provider) {
                continue;
            }

            // Login Route
            this.get(`/auth/${providerName}/login`, async (ctx) => {
                const state = generateState();
                const codeVerifier = (providerName === 'google' || providerName === 'microsoft' || providerName === 'auth0' || providerName === 'okta')
                    ? generateCodeVerifier() : undefined; // PKCE for some

                // Store state/verifier in cookie for verification
                const scopes = providerConfig.scopes || [];
                let url: URL;

                if (provider instanceof GitHub) {
                    url = await provider.createAuthorizationURL(state, scopes);
                } else if (provider instanceof Google || provider instanceof MicrosoftEntraId || provider instanceof Auth0 || provider instanceof Okta) {
                    // These all support PKCE in recent versions
                    // Types might vary slightly but usually createAuthorizationURL(state, codeVerifier, scopes)
                    url = await (provider as any).createAuthorizationURL(state, codeVerifier!, scopes);
                } else if (provider instanceof Apple) {
                    url = await provider.createAuthorizationURL(state, scopes);
                } else if (provider instanceof OAuth2Client) {
                    if (!providerConfig.authUrl) return ctx.text("Config error: authUrl required for oauth2", 500);
                    url = await provider.createAuthorizationURL(providerConfig.authUrl, state, scopes);
                } else {
                    return ctx.text("Provider config error", 500);
                }

                // Security: Set secure cookies with SameSite=Lax to prevent CSRF attacks
                const isSecure = ctx.secure;
                ctx.res.headers.set("Set-Cookie", `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}; Max-Age=600`);
                if (codeVerifier) {
                    ctx.res.headers.append("Set-Cookie", `oauth_verifier=${codeVerifier}; Path=/; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}; Max-Age=600`);
                }

                return ctx.redirect(url.toString());
            });

            // Callback Route
            this.get(`/auth/${providerName}/callback`, async (ctx) => {
                const url = new URL(ctx.req.url);
                const code = url.searchParams.get("code");
                const state = url.searchParams.get("state");

                console.log("== OAuth Callback Hit ==", { providerName, code, state });

                const cookieHeader = ctx.req.headers.get("Cookie");
                const storedState = cookieHeader?.match(/oauth_state=([^;]+)/)?.[1];
                const storedVerifier = cookieHeader?.match(/oauth_verifier=([^;]+)/)?.[1];

                if (!code || !state || !storedState || state !== storedState) {
                    return ctx.text("Invalid state or code", 400);
                }

                try {
                    let tokens: any;
                    let idToken: string | undefined;

                    if (provider instanceof GitHub) {
                        tokens = await provider.validateAuthorizationCode(code);
                    } else if (provider instanceof Google || provider instanceof MicrosoftEntraId) {
                        if (!storedVerifier) return ctx.text("Missing verifier", 400);
                        tokens = await provider.validateAuthorizationCode(code, storedVerifier);
                    } else if (provider instanceof Auth0 || provider instanceof Okta) {
                        tokens = await (provider as any).validateAuthorizationCode(code, storedVerifier || "");
                    } else if (provider instanceof Apple) {
                        tokens = await provider.validateAuthorizationCode(code);
                        idToken = tokens.idToken;
                    } else if (provider instanceof OAuth2Client) {
                        if (!providerConfig.tokenUrl) return ctx.text("Config error: tokenUrl required for oauth2", 500);
                        tokens = await provider.validateAuthorizationCode(providerConfig.tokenUrl, code, null);
                    }

                    // Call accessToken as a method if it's an arctic v3+ OAuth2Tokens object
                    const accessToken = typeof tokens.accessToken === 'function' ? tokens.accessToken() : (tokens.accessToken || tokens.access_token);

                    // Call idToken if present. Arctic v3 throws if it's missing, so wrap in try-catch.
                    try {
                        if (typeof tokens.idToken === 'function') {
                            idToken = tokens.idToken();
                        } else if (tokens.idToken) {
                            idToken = tokens.idToken;
                        }
                    } catch (e) {
                        // Ignore missing idToken for providers like GitHub that don't issue them natively
                    }

                    const user = await this.fetchUser(providerName, accessToken, providerConfig, idToken);

                    if (this.authConfig.onSuccess) {
                        const res = await this.authConfig.onSuccess(user, ctx);
                        if (res) return res; // Allow override response
                    }

                    // Default behavior: create encoded session and returning it or redirect
                    const jwt = await this.createSession(user, ctx);

                    if (this.authConfig.successRedirect) {
                        return ctx.redirect(this.authConfig.successRedirect);
                    }
                    return ctx.json({ token: jwt, user });

                } catch (e: any) {
                    console.error("Auth Exception:", e);
                    let extradata = "";
                    try { if (e && e.response) extradata = " | Body: " + await e.response.text(); } catch { }
                    // Temporary debug: Return the actual error message to the client
                    ctx.app?.logger?.error('Auth', 'Authentication failed', e);
                    return ctx.text(`Authentication failed.\nError: ${e?.message ?? String(e)}${extradata}\n\nStack:\n${e?.stack}`, 500);
                }
            });
        }
    }

    private async fetchUser(provider: string, token: string, config: ProviderConfig, idToken?: string): Promise<AuthUser> {
        let user: AuthUser = { id: 'unknown', provider };

        if (provider === 'github') {
            const res = await fetch("https://api.github.com/user", {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'User-Agent': 'Shokupan-Auth/1.0'
                }
            });
            const data = await res.json() as any;
            user = {
                id: String(data.id),
                name: data.name || data.login,
                email: data.email,
                picture: data.avatar_url,
                provider,
                raw: data
            };
        }
        else if (provider === 'google') {
            const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json() as any;
            user = {
                id: data.sub,
                name: data.name,
                email: data.email,
                picture: data.picture,
                provider,
                raw: data
            };
        }
        else if (provider === 'microsoft') {
            const res = await fetch("https://graph.microsoft.com/v1.0/me", {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json() as any;
            user = {
                id: data.id,
                name: data.displayName,
                email: data.mail || data.userPrincipalName,
                provider,
                raw: data
            };
        }
        else if (provider === 'auth0' || provider === 'okta') {
            const domain = config.domain!.startsWith('http') ? config.domain! : `https://${config.domain}`;
            const endpoint = provider === 'auth0' ? `${domain}/userinfo` : `${domain}/oauth2/v1/userinfo`;

            const res = await fetch(endpoint, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json() as any;
            user = {
                id: data.sub,
                name: data.name,
                email: data.email,
                picture: data.picture,
                provider,
                raw: data
            };
        }
        else if (provider === 'apple') {
            // Apple user info is in the ID Token.
            // Security: Must cryptographically verify the signature using Apple's public JWKS.
            // Using decodeJwt() alone is insecure as it skips signature verification.
            if (idToken) {
                const { createRemoteJWKSet, jwtVerify } = this.jose;
                // Cache the JWKS key fetcher to avoid redundant network requests per login.
                if (!(this as any)._appleJwks) {
                    (this as any)._appleJwks = createRemoteJWKSet(
                        new URL('https://appleid.apple.com/auth/keys')
                    );
                }
                const { payload } = await jwtVerify(idToken, (this as any)._appleJwks, {
                    issuer: 'https://appleid.apple.com',
                    audience: this.authConfig.providers.apple?.clientId
                });
                user = {
                    id: payload.sub!,
                    email: payload['email'] as string,
                    provider,
                    raw: payload
                };
            }
        }
        else if (provider === 'oauth2') {
            if (config.userInfoUrl) {
                const res = await fetch(config.userInfoUrl, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json() as any;
                user = {
                    id: data.id || data.sub || 'unknown',
                    name: data.name,
                    email: data.email,
                    picture: data.picture,
                    provider,
                    raw: data
                };
            }
        }

        return user;
    }

    /**
     * Middleware to verify JWT
     */
    public getMiddleware() {
        return async (ctx: ShokupanContext, next: () => Promise<any>) => {
            if (!this.jose) {
                // Try to load jose if not already loaded (e.g. middleware used without full plugin init?)
                // Ideally onInit should have run.
                this.jose = await import("jose");
            }

            const authHeader = ctx.req.headers.get("Authorization");
            let token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

            if (!token) {
                // Try cookie
                const cookieHeader = ctx.req.headers.get("Cookie");
                token = cookieHeader?.match(/auth_token=([^;]+)/)?.[1] || null;
            }

            if (token) {
                try {
                    const { payload } = await this.jose.jwtVerify(token, this.secret);
                    (ctx as any).user = payload;
                } catch {
                    // Invalid token, just proceed without user or throw?
                    // Usually proceed, let guard handle it if required
                }
            }
            return next();
        };
    }
}
