import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

type Plugin = 'dashboard' | 'api-explorer' | 'asyncapi' | 'scalar';

/**
 * PermissionService – checks whether the current user can access a plugin.
 *
 * Permission claims live in the JWT as an array like:
 *   ["dashboard:read", "api-explorer:read", "asyncapi:read", "scalar:read"]
 *
 * If the JWT carries no `permissions` claim at all (legacy or open mode),
 * ALL plugins are accessible (open-by-default behaviour).
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
    private auth = inject(AuthService);

    /**
     * Returns true if the current user can read the given plugin.
     * When no permissions claim exists, all plugins are accessible.
     */
    canRead(plugin: Plugin): boolean {
        const user = this.auth.user();
        if (!user) return false;

        // No permissions claim → open mode, allow all
        if (!user.permissions || user.permissions.length === 0) return true;

        return user.permissions.includes(`${plugin}:read`);
    }

    /** Convenience: return list of accessible plugins for nav building */
    accessiblePlugins(): Plugin[] {
        const all: Plugin[] = ['dashboard', 'api-explorer', 'asyncapi', 'scalar'];
        return all.filter(p => this.canRead(p));
    }
}
