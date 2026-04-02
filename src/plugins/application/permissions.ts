
import { ShokupanContext } from "../../context";
import { ShokupanRouter } from "../../router";
import type { Shokupan } from "../../shokupan";
import { $isMounted } from "../../util/symbol";
import type { ShokupanPlugin, ShokupanPluginOptions } from "../../util/types";

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

export type PermissionResolver = (
    user: any,
    permission: PermissionCheck,
    ctx: ShokupanContext
) => boolean | Promise<boolean>;

export interface PermissionConfig {
    roles?: Role[];
    customResolvers?: Map<string, PermissionResolver>;
    getUserPermissions?: (user: any, ctx: ShokupanContext) => Permission[] | Promise<Permission[]>;
    getUserRoles?: (user: any, ctx: ShokupanContext) => string[] | Promise<string[]>;
    onUnauthorized?: (ctx: ShokupanContext, check: PermissionCheck) => Response | Promise<Response>;
    enableWildcards?: boolean;
    caseSensitive?: boolean;
}

export class PermissionPlugin extends ShokupanRouter<any> implements ShokupanPlugin {
    private roles: Map<string, Role> = new Map();
    private customResolvers: Map<string, PermissionResolver> = new Map();
    private permissionConfig: PermissionConfig;

    constructor(config: PermissionConfig = {}) {
        super();
        this.permissionConfig = {
            enableWildcards: true,
            caseSensitive: false,
            ...config
        };

        if (config.roles) {
            config.roles.forEach(role => this.addRole(role));
        }

        if (config.customResolvers) {
            config.customResolvers.forEach((resolver, key) => {
                this.customResolvers.set(key, resolver);
            });
        }
    }

    async onInit(app: Shokupan, options: ShokupanPluginOptions) {
        this.init();

        if (!(this as any)[$isMounted]) {
            app.mount(options?.path ?? '/', this);
        }
    }

    private init() {
        this.get('/permissions/roles', async (ctx) => {
            const roles = Array.from(this.roles.values()).map(role => ({
                name: role.name,
                description: role.description,
                permissions: role.permissions,
                inherits: role.inherits
            }));
            return ctx.json({ roles });
        });

        this.get('/permissions/check', async (ctx) => {
            const user = (ctx as any).user;
            if (!user) {
                return ctx.json({ error: 'Unauthenticated' }, 401);
            }

            const { resource, action, context: checkContext } = ctx.query;
            if (!resource || !action) {
                return ctx.json({ error: 'Missing resource or action' }, 400);
            }

            const check: PermissionCheck = {
                resource: resource as string,
                action: action as string,
                context: checkContext ? JSON.parse(checkContext as string) : undefined
            };

            const hasPermission = await this.checkPermission(user, check, ctx);
            return ctx.json({ hasPermission, check });
        });

        this.get('/permissions/user', async (ctx) => {
            const user = (ctx as any).user;
            if (!user) {
                return ctx.json({ error: 'Unauthenticated' }, 401);
            }

            const permissions = await this.getUserPermissions(user, ctx);
            const roles = await this.getUserRoles(user, ctx);

            return ctx.json({ permissions, roles });
        });
    }

    public addRole(role: Role): void {
        this.roles.set(role.name, role);
    }

    public removeRole(roleName: string): void {
        this.roles.delete(roleName);
    }

    public getRole(roleName: string): Role | undefined {
        return this.roles.get(roleName);
    }

    public addCustomResolver(key: string, resolver: PermissionResolver): void {
        this.customResolvers.set(key, resolver);
    }

    private async getUserPermissions(user: any, ctx: ShokupanContext): Promise<Permission[]> {
        if (this.permissionConfig.getUserPermissions) {
            return await this.permissionConfig.getUserPermissions(user, ctx);
        }

        if (user.permissions && Array.isArray(user.permissions)) {
            return user.permissions.map((p: any) => {
                if (typeof p === 'string') {
                    const [resource, action] = p.split(':');
                    return { resource, action };
                }
                return p;
            });
        }

        return [];
    }

    private async getUserRoles(user: any, ctx: ShokupanContext): Promise<string[]> {
        if (this.permissionConfig.getUserRoles) {
            return await this.permissionConfig.getUserRoles(user, ctx);
        }

        if (user.roles && Array.isArray(user.roles)) {
            return user.roles;
        }

        return [];
    }

    private async getRolePermissions(roleName: string): Promise<Permission[]> {
        const role = this.roles.get(roleName);
        if (!role) return [];

        let permissions = [...role.permissions];

        if (role.inherits) {
            for (const inheritedRoleName of role.inherits) {
                const inheritedPermissions = await this.getRolePermissions(inheritedRoleName);
                permissions = [...permissions, ...inheritedPermissions];
            }
        }

        return permissions;
    }

    private matchesPermission(
        userPermission: Permission,
        requiredPermission: PermissionCheck
    ): boolean {
        const resourceMatch = this.matchesPattern(
            userPermission.resource,
            requiredPermission.resource
        );

        const actionMatch = this.matchesPattern(
            userPermission.action,
            requiredPermission.action
        );

        if (!resourceMatch || !actionMatch) {
            return false;
        }

        if (requiredPermission.context && userPermission.conditions) {
            return this.matchesConditions(
                userPermission.conditions,
                requiredPermission.context
            );
        }

        return true;
    }

    private matchesPattern(pattern: string, value: string): boolean {
        if (!this.permissionConfig.caseSensitive) {
            pattern = pattern.toLowerCase();
            value = value.toLowerCase();
        }

        if (!this.permissionConfig.enableWildcards) {
            return pattern === value;
        }

        if (pattern === '*') return true;

        const regex = new RegExp(
            '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
        );
        return regex.test(value);
    }

    private matchesConditions(
        conditions: Record<string, any>,
        context: Record<string, any>
    ): boolean {
        for (const [key, value] of Object.entries(conditions)) {
            if (context[key] !== value) {
                return false;
            }
        }
        return true;
    }

    public async checkPermission(
        user: any,
        check: PermissionCheck,
        ctx: ShokupanContext
    ): Promise<boolean> {
        if (!user) return false;

        const resolverKey = `${check.resource}:${check.action}`;
        const resolver = this.customResolvers.get(resolverKey) || 
                        this.customResolvers.get(check.resource) ||
                        this.customResolvers.get('*');

        if (resolver) {
            return await resolver(user, check, ctx);
        }

        const userPermissions = await this.getUserPermissions(user, ctx);
        for (const permission of userPermissions) {
            if (this.matchesPermission(permission, check)) {
                return true;
            }
        }

        const userRoles = await this.getUserRoles(user, ctx);
        for (const roleName of userRoles) {
            const rolePermissions = await this.getRolePermissions(roleName);
            for (const permission of rolePermissions) {
                if (this.matchesPermission(permission, check)) {
                    return true;
                }
            }
        }

        return false;
    }

    public requirePermission(resource: string, action: string, context?: Record<string, any>) {
        return async (ctx: ShokupanContext, next: () => Promise<any>) => {
            const user = (ctx as any).user;

            if (!user) {
                if (this.permissionConfig.onUnauthorized) {
                    return await this.permissionConfig.onUnauthorized(ctx, { resource, action, context });
                }
                return ctx.json({ error: 'Unauthenticated' }, 401);
            }

            const check: PermissionCheck = { resource, action, context };
            const hasPermission = await this.checkPermission(user, check, ctx);

            if (!hasPermission) {
                if (this.permissionConfig.onUnauthorized) {
                    return await this.permissionConfig.onUnauthorized(ctx, check);
                }
                return ctx.json({ 
                    error: 'Forbidden',
                    message: `Missing permission: ${resource}:${action}`
                }, 403);
            }

            return next();
        };
    }

    public requireRole(...roleNames: string[]) {
        return async (ctx: ShokupanContext, next: () => Promise<any>) => {
            const user = (ctx as any).user;

            if (!user) {
                if (this.permissionConfig.onUnauthorized) {
                    return await this.permissionConfig.onUnauthorized(ctx, { 
                        resource: 'role', 
                        action: 'check' 
                    });
                }
                return ctx.json({ error: 'Unauthenticated' }, 401);
            }

            const userRoles = await this.getUserRoles(user, ctx);
            const hasRole = roleNames.some(role => userRoles.includes(role));

            if (!hasRole) {
                if (this.permissionConfig.onUnauthorized) {
                    return await this.permissionConfig.onUnauthorized(ctx, { 
                        resource: 'role', 
                        action: 'check',
                        context: { requiredRoles: roleNames }
                    });
                }
                return ctx.json({ 
                    error: 'Forbidden',
                    message: `Missing required role: ${roleNames.join(' or ')}`
                }, 403);
            }

            return next();
        };
    }

    public requireAnyPermission(...checks: PermissionCheck[]) {
        return async (ctx: ShokupanContext, next: () => Promise<any>) => {
            const user = (ctx as any).user;

            if (!user) {
                if (this.permissionConfig.onUnauthorized) {
                    return await this.permissionConfig.onUnauthorized(ctx, checks[0]);
                }
                return ctx.json({ error: 'Unauthenticated' }, 401);
            }

            for (const check of checks) {
                const hasPermission = await this.checkPermission(user, check, ctx);
                if (hasPermission) {
                    return next();
                }
            }

            if (this.permissionConfig.onUnauthorized) {
                return await this.permissionConfig.onUnauthorized(ctx, checks[0]);
            }

            return ctx.json({ 
                error: 'Forbidden',
                message: 'Missing required permissions'
            }, 403);
        };
    }

    public requireAllPermissions(...checks: PermissionCheck[]) {
        return async (ctx: ShokupanContext, next: () => Promise<any>) => {
            const user = (ctx as any).user;

            if (!user) {
                if (this.permissionConfig.onUnauthorized) {
                    return await this.permissionConfig.onUnauthorized(ctx, checks[0]);
                }
                return ctx.json({ error: 'Unauthenticated' }, 401);
            }

            for (const check of checks) {
                const hasPermission = await this.checkPermission(user, check, ctx);
                if (!hasPermission) {
                    if (this.permissionConfig.onUnauthorized) {
                        return await this.permissionConfig.onUnauthorized(ctx, check);
                    }
                    return ctx.json({ 
                        error: 'Forbidden',
                        message: `Missing permission: ${check.resource}:${check.action}`
                    }, 403);
                }
            }

            return next();
        };
    }
}
