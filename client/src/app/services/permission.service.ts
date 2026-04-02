import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

type Plugin = 'dashboard' | 'api-explorer' | 'asyncapi' | 'scalar' | 'permissions';

export interface Permission {
    resource: string;
    action: string;
    conditions?: Record<string, any>;
}

export interface Role {
    name: string;
    description?: string;
    permissions: Permission[];
    inherits?: string[];
}

export interface PermissionCheck {
    resource: string;
    action: string;
    context?: Record<string, any>;
}

export interface UserPermissions {
    permissions: Permission[];
    roles: string[];
}

/**
 * PermissionService – manages permissions and roles for the application.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
    private auth = inject(AuthService);
    private http = inject(HttpClient);

    roles = signal<Role[]>([]);
    userPermissions = signal<UserPermissions | null>(null);

    /**
     * Returns true if the current user can read the given plugin.
     * When no permissions claim exists, all plugins are accessible.
     */
    canRead(plugin: Plugin): boolean {
        const user = this.auth.user();
        if (!user) return false;

        if (!user.permissions || user.permissions.length === 0) return true;

        return user.permissions.includes(`${plugin}:read`);
    }

    /** Convenience: return list of accessible plugins for nav building */
    accessiblePlugins(): Plugin[] {
        const all: Plugin[] = ['dashboard', 'api-explorer', 'asyncapi', 'scalar'];
        return all.filter(p => this.canRead(p));
    }

    /** Load all roles from the server */
    async loadRoles(): Promise<void> {
        try {
            const response = await firstValueFrom(
                this.http.get<{ roles: Role[] }>('/permissions/roles')
            );
            this.roles.set(response.roles);
        } catch (error) {
            console.error('Failed to load roles:', error);
            this.roles.set([]);
        }
    }

    /** Load current user's permissions and roles */
    async loadUserPermissions(): Promise<void> {
        try {
            const response = await firstValueFrom(
                this.http.get<UserPermissions>('/permissions/user')
            );
            this.userPermissions.set(response);
        } catch (error) {
            console.error('Failed to load user permissions:', error);
            this.userPermissions.set(null);
        }
    }

    /** Check if user has a specific permission */
    async checkPermission(resource: string, action: string, context?: Record<string, any>): Promise<boolean> {
        try {
            const params: any = { resource, action };
            if (context) {
                params.context = JSON.stringify(context);
            }
            const response = await firstValueFrom(
                this.http.get<{ hasPermission: boolean }>('/permissions/check', { params })
            );
            return response.hasPermission;
        } catch (error) {
            console.error('Failed to check permission:', error);
            return false;
        }
    }

    /** Check if user has a specific permission (synchronous, uses cached data) */
    hasPermission(resource: string, action: string): boolean {
        const userPerms = this.userPermissions();
        if (!userPerms) return false;

        return userPerms.permissions.some(
            p => this.matchesPattern(p.resource, resource) && this.matchesPattern(p.action, action)
        );
    }

    /** Check if user has a specific role */
    hasRole(roleName: string): boolean {
        const userPerms = this.userPermissions();
        if (!userPerms) return false;

        return userPerms.roles.includes(roleName);
    }

    /** Get permissions for a specific role */
    getRolePermissions(roleName: string): Permission[] {
        const role = this.roles().find(r => r.name === roleName);
        if (!role) return [];

        let permissions = [...role.permissions];

        if (role.inherits) {
            for (const inheritedRoleName of role.inherits) {
                permissions = [...permissions, ...this.getRolePermissions(inheritedRoleName)];
            }
        }

        return permissions;
    }

    private matchesPattern(pattern: string, value: string): boolean {
        if (pattern === '*') return true;
        if (pattern === value) return true;

        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
        return regex.test(value);
    }
}
