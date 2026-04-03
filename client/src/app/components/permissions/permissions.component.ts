import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { AuthService } from '../../services/auth.service';
import { Permission, PermissionService, Role } from '../../services/permission.service';

import { BadgeModule } from 'primeng/badge';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChipModule } from 'primeng/chip';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { PanelModule } from 'primeng/panel';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';


@Component({
    selector: 'app-permissions',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        NgScrollbarModule,
        CardModule,
        TableModule,
        TagModule,
        ButtonModule,
        Tabs,
        TabList,
        Tab,
        TabPanels,
        TabPanel,
        ChipModule,
        BadgeModule,
        TooltipModule,
        InputTextModule,
        PanelModule,
        DividerModule,
        SkeletonModule
    ],
    templateUrl: './permissions.component.html',
    styleUrls: ['./permissions.component.scss']
})
export class PermissionsComponent implements OnInit {
    permissionService = inject(PermissionService);
    authService = inject(AuthService);

    loading = signal(true);
    activeTab = signal<string>('0');
    searchTerm = signal('');

    user = this.authService.user;
    roles = this.permissionService.roles;
    userPermissions = this.permissionService.userPermissions;

    filteredRoles = computed(() => {
        const search = this.searchTerm().toLowerCase();
        if (!search) return this.roles();

        return this.roles().filter(role =>
            role.name.toLowerCase().includes(search) ||
            role.description?.toLowerCase().includes(search) ||
            role.permissions.some(p =>
                p.resource.toLowerCase().includes(search) ||
                p.action.toLowerCase().includes(search)
            )
        );
    });

    permissionMatrix = computed(() => {
        const roles = this.roles();
        const resources = new Set<string>();
        const actions = new Set<string>();

        roles.forEach(role => {
            this.permissionService.getRolePermissions(role.name).forEach(p => {
                resources.add(p.resource);
                actions.add(p.action);
            });
        });

        return {
            roles,
            resources: Array.from(resources).sort(),
            actions: Array.from(actions).sort()
        };
    });

    async ngOnInit() {
        await this.loadData();
    }

    async loadData() {
        this.loading.set(true);
        try {
            await Promise.all([
                this.permissionService.loadRoles(),
                this.permissionService.loadUserPermissions()
            ]);
        } finally {
            this.loading.set(false);
        }
    }

    hasRolePermission(roleName: string, resource: string, action: string): boolean {
        const permissions = this.permissionService.getRolePermissions(roleName);
        return permissions.some(p =>
            this.matchesPattern(p.resource, resource) &&
            this.matchesPattern(p.action, action)
        );
    }

    private matchesPattern(pattern: string, value: string): boolean {
        if (pattern === '*') return true;
        if (pattern === value) return true;

        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
        return regex.test(value);
    }

    getPermissionSeverity(resource: string, action: string): 'success' | 'info' | 'warn' | 'danger' {
        if (resource === '*' && action === '*') return 'danger';
        if (resource === '*' || action === '*') return 'warn';
        if (action === 'delete') return 'danger';
        if (action === 'update' || action === 'create') return 'warn';
        return 'info';
    }

    getRoleColor(roleName: string): string {
        const colors: Record<string, string> = {
            'admin': 'danger',
            'moderator': 'warn',
            'editor': 'info',
            'viewer': 'success'
        };
        return colors[roleName.toLowerCase()] || 'secondary';
    }

    formatPermission(permission: Permission): string {
        return `${permission.resource}:${permission.action}`;
    }

    getInheritedRoles(role: Role): string[] {
        if (!role.inherits) return [];
        return role.inherits;
    }

    getAllPermissionsForRole(roleName: string): Permission[] {
        return this.permissionService.getRolePermissions(roleName);
    }

    getUserEffectivePermissions(): Permission[] {
        const roleNames = this.getUserRoleNames();
        const allPermissions: Permission[] = [];
        const seen = new Set<string>();

        roleNames.forEach(roleName => {
            const perms = this.getAllPermissionsForRole(roleName);
            perms.forEach(perm => {
                const key = `${perm.resource}:${perm.action}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    allPermissions.push(perm);
                }
            });
        });

        return allPermissions;
    }

    getUserRoleNames(): string[] {
        return this.userPermissions()?.roles || [];
    }

    hasRole(roleName: string): boolean {
        return this.getUserRoleNames().includes(roleName);
    }

    getUniqueResources(): number {
        const permissions = this.getUserEffectivePermissions();
        if (!permissions.length) return 0;
        const resources = new Set(permissions.map(p => p.resource));
        return resources.size;
    }

    getPermissionSummaryData(): { label: string; value: string; severity: string }[] {
        return [
            {
                label: 'Total Permissions',
                value: String(this.getUserEffectivePermissions().length),
                severity: 'info'
            },
            {
                label: 'Assigned Roles',
                value: String(this.getUserRoleNames().length),
                severity: 'success'
            },
            {
                label: 'Resources',
                value: String(this.getUniqueResources()),
                severity: 'warning'
            }
        ];
    }
}
