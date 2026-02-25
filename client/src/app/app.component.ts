import { Component, inject } from '@angular/core';
import { LoginComponent } from './components/login/login.component';
import { ShellComponent } from './components/shell/shell.component';
import { AuthService } from './services/auth.service';
import { PermissionService } from './services/permission.service';

@Component({
  selector: 'skp-root',
  standalone: true,
  imports: [LoginComponent, ShellComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly perms = inject(PermissionService);
}
