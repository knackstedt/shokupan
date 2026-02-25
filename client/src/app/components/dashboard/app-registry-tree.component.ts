import { CommonModule } from '@angular/common';
import { Component, Input, signal } from '@angular/core';
import { NgScrollbarModule } from 'ngx-scrollbar';

@Component({
    selector: 'skp-app-registry-tree',
    standalone: true,
    imports: [CommonModule, NgScrollbarModule],
    templateUrl: './app-registry-tree.component.html',
    styleUrl: './app-registry-tree.component.scss'
})
export class AppRegistryTreeComponent {
    @Input() set rawData(value: any) {
        if (value) {
            this.processData(value);
        }
    }
    @Input() metrics: any = {};

    readonly rootItems = signal<any[]>([]);

    private processData(root: any) {
        const allItems: any[] = [];
        if (root.middleware) root.middleware.forEach((i: any) => allItems.push({ ...i, kind: 'middleware' }));
        if (root.routes) root.routes.forEach((i: any) => allItems.push({ ...i, kind: 'route' }));
        if (root.routers) root.routers.forEach((i: any) => allItems.push({ ...i, kind: 'router' }));
        if (root.controllers) root.controllers.forEach((i: any) => allItems.push({ ...i, kind: 'controller' }));
        if (root.events) root.events.forEach((i: any) => allItems.push({ ...i, kind: 'event' }));

        const kindPriority: Record<string, number> = { 'middleware': 0, 'router': 1, 'controller': 2, 'route': 3, 'event': 4 };

        allItems.sort((a, b) => {
            const pA = kindPriority[a.kind] !== undefined ? kindPriority[a.kind] : 99;
            const pB = kindPriority[b.kind] !== undefined ? kindPriority[b.kind] : 99;
            if (pA !== pB) return pA - pB;
            return (a.order || 0) - (b.order || 0);
        });

        const uniqueItems: any[] = [];
        const seenIds = new Set<string>();
        allItems.forEach(item => {
            const uniqueKey = item.id || (item.kind + ':' + (item.path || item.name));
            if (!seenIds.has(uniqueKey)) {
                seenIds.add(uniqueKey);
                uniqueItems.push(item);
            }
        });

        this.rootItems.set(uniqueItems);
    }

    isBuiltin(meta: any): boolean {
        return meta?.isBuiltin === true;
    }

    getChildren(item: any): any[] {
        return Array.isArray(item.children) ? item.children : [];
    }
}
