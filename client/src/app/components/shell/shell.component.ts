import {
  Component, inject, signal
} from '@angular/core';
import { AngularSplitModule } from 'angular-split';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { ApiExplorerComponent } from '../api-explorer/api-explorer.component';
import { AsyncApiComponent } from '../asyncapi/asyncapi.component';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { ScalarComponent } from '../scalar/scalar.component';

export type TabId = 'dashboard' | 'api-explorer' | 'asyncapi' | 'scalar';

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
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly perms = inject(PermissionService);

  private readonly allTabs: NavTab[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', permission: 'dashboard' },
    { id: 'api-explorer', label: 'REST API', icon: '🔌', permission: 'api-explorer' },
    { id: 'asyncapi', label: 'WebSocket API', icon: '⚡', permission: 'asyncapi' },
    { id: 'scalar', label: 'Reference', icon: '📖', permission: 'scalar' },
  ];

  readonly visibleTabs = () =>
    this.allTabs.filter(t => this.perms.canRead(t.permission));

  readonly activeTab = signal<TabId>('dashboard');

  setTab(id: TabId): void {
    this.activeTab.set(id);
  }
}
