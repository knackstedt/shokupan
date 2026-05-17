import { Component, inject, OnInit } from '@angular/core';
import { LoginComponent } from './components/login/login.component';
import { ShellComponent } from './components/shell/shell.component';
import { AuthService } from './services/auth.service';
import { ConfigService } from './services/config.service';
import { PermissionService } from './services/permission.service';

@Component({
  selector: 'skp-root',
  standalone: true,
  imports: [LoginComponent, ShellComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly perms = inject(PermissionService);
  private config = inject(ConfigService);

  ngOnInit(): void {
    this.config.loadConfig();
  }
}
