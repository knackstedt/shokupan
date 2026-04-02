import {
    Component,
    computed,
    effect,
    inject,
    OnInit,
    signal
} from '@angular/core';
import { AngularSplitModule } from 'angular-split';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { ApiExplorerComponent } from '../api-explorer/api-explorer.component';
import { AsyncApiComponent } from '../asyncapi/asyncapi.component';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { PermissionsComponent } from '../permissions/permissions.component';
import { ScalarComponent } from '../scalar/scalar.component';

export type TabId = 'dashboard' | 'api-explorer' | 'asyncapi' | 'scalar' | 'permissions';

interface NavTab {
  id: TabId;
  label: string;
  icon: string;
  permission: TabId;
}

@Component({
  selector: 'skp-shell',
  standalone: true,
  imports: [
    AngularSplitModule,
    DashboardComponent,
    ApiExplorerComponent,
    AsyncApiComponent,
    ScalarComponent,
    PermissionsComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly perms = inject(PermissionService);

  private readonly allTabs: NavTab[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', permission: 'dashboard' },
    { id: 'api-explorer', label: 'REST API', icon: '🔌', permission: 'api-explorer' },
    { id: 'asyncapi', label: 'WebSocket API', icon: '⚡', permission: 'asyncapi' },
    { id: 'scalar', label: 'Reference', icon: '📖', permission: 'scalar' },
    { id: 'permissions', label: 'Permissions', icon: '🔐', permission: 'permissions' },
  ];

  readonly visibleTabs = computed(() => {
    const visible = this.allTabs.filter(t => {
      const canRead = this.perms.canRead(t.permission);
      return canRead;
    });

    return visible;
  });

  readonly activeTab = signal<TabId>('dashboard');
  private isInitializing = true;

  constructor() {
    // Update URL hash when tab changes (but preserve endpoint part)
    effect(() => {
      const tab = this.activeTab();
      if (tab && !this.isInitializing) {
        // Preserve the endpoint part of the hash if it exists
        const currentHash = window.location.hash.slice(1);
        const currentParts = currentHash.split('/');
        if (currentParts[0] === tab && currentParts.length > 1) {
          // Hash already has this tab with an endpoint, don't overwrite
          return;
        }
        window.location.hash = tab;
      }
    });
  }

  ngOnInit(): void {
    // Restore tab from URL hash on init
    const hash = window.location.hash.slice(1); // Remove '#'
    const tabFromHash = hash.split('/')[0] as TabId; // Get first segment

    if (tabFromHash && this.visibleTabs().some(t => t.id === tabFromHash)) {
      this.activeTab.set(tabFromHash);
    }

    // Allow effect to run after initialization
    setTimeout(() => {
      this.isInitializing = false;
    }, 0);
  }

  setTab(id: TabId): void {
    this.activeTab.set(id);
  }
}
