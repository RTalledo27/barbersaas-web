import { Injectable, signal } from '@angular/core';

/**
 * Estado UI compartido del shell autenticado.
 * - sidebarOpen: controla el drawer móvil del sidebar.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private _sidebarOpen = signal(false);
  readonly sidebarOpen = this._sidebarOpen.asReadonly();

  toggleSidebar(): void {
    this._sidebarOpen.update(v => !v);
  }

  openSidebar(): void {
    this._sidebarOpen.set(true);
  }

  closeSidebar(): void {
    this._sidebarOpen.set(false);
  }
}
