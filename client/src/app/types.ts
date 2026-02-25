export interface AuthUser {
    id: string;
    email?: string;
    name?: string;
    picture?: string;
    provider: string;
    permissions?: string[];
    /** Raw JWT expiration (unix seconds) */
    exp?: number;
    iat?: number;
}

export type OAuthProvider = 'github' | 'google' | 'microsoft' | 'apple' | 'auth0' | 'okta' | 'oauth2';

export interface PluginPermission {
    plugin: 'dashboard' | 'api-explorer' | 'asyncapi' | 'scalar';
    read: boolean;
}
