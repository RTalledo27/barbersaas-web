import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../../sidebar/sidebar';
import { TopbarComponent } from '../../topbar/topbar';
import { LayoutService } from '../../layout.service';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css'
})
export class AppShellComponent {
  private layout = inject(LayoutService);
  sidebarOpen = this.layout.sidebarOpen;

  closeSidebar(): void {
    this.layout.closeSidebar();
  }
}
