import { Component, signal, inject, computed, HostListener } from '@angular/core';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { LayoutService } from '../layout.service';
import { AgendaBadgeService } from '../../services/agenda-badge.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './topbar.html',
  styleUrl: './topbar.css'
})
export class TopbarComponent {
  private router = inject(Router);
  private auth   = inject(AuthService);
  private layout = inject(LayoutService);
  private badge  = inject(AgendaBadgeService);

  // ─── Page meta ───────────────────────────────────────
  pageTitle    = signal('Dashboard');
  pageSubtitle = signal('Resumen general de tu barbería');

  // ─── Notificaciones → citas pendientes+confirmadas hoy ─
  notifications = computed(() => this.badge.todayActive() ?? 0);
  searchOpen    = signal(false);
  userMenuOpen  = signal(false);

  // ─── Auth-derived (vía AuthService, no localStorage) ─
  user        = this.auth.currentUser;
  userName    = computed(() => this.user()?.name ?? 'Usuario');
  userEmail   = computed(() => this.user()?.email ?? '');
  userInitial = computed(() => (this.user()?.name?.charAt(0) ?? 'U').toUpperCase());
  userRole    = computed(() => {
    const role = this.user()?.role;
    const map: Record<string, string> = {
      owner: 'Propietario',
      admin: 'Administrador',
      employee: 'Empleado',
      super_admin: 'Super Admin',
    };
    return role ? map[role] ?? role : '';
  });

  // Mapeo ruta → título/subtítulo
  private titles: Record<string, { title: string; subtitle: string }> = {
    '/app/dashboard':    { title: 'Dashboard',     subtitle: 'Resumen general de tu barbería' },
    '/app/appointments': { title: 'Agenda',        subtitle: 'Gestiona todas tus citas' },
    '/app/clients':      { title: 'Clientes',      subtitle: 'CRM y base de clientes' },
    '/app/team':         { title: 'Equipo',        subtitle: 'Barberos y horarios' },
    '/app/services':     { title: 'Servicios',     subtitle: 'Catálogo y precios' },
    '/app/payments':     { title: 'Caja',          subtitle: 'Cobros y comprobantes' },
    '/app/revenue':      { title: 'Ingresos',      subtitle: 'Caja, gastos y comisiones' },
    '/app/analytics':    { title: 'Estadísticas',  subtitle: 'Reportes y métricas' },
    '/app/profile':      { title: 'Mi perfil',      subtitle: 'Datos de tu cuenta' },
    '/app/settings':     { title: 'Configuración', subtitle: 'Ajustes de la barbería' },
  };

  constructor() {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        const meta = this.titles[e.urlAfterRedirects];
        if (meta) {
          this.pageTitle.set(meta.title);
          this.pageSubtitle.set(meta.subtitle);
        }
      });
  }

  // ─── Fecha de hoy formateada ─────────────────────────
  today = computed(() => {
    return new Date().toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  });

  // ─── Acciones ────────────────────────────────────────
  toggleMenu(): void {
    this.layout.toggleSidebar();
  }

  toggleSearch(): void {
    this.searchOpen.update(v => !v);
  }

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.userMenuOpen.update(v => !v);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  // Cierra el dropdown al hacer click fuera o al presionar ESC
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.userMenuOpen()) this.userMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.userMenuOpen()) this.userMenuOpen.set(false);
  }

  logout(): void {
    this.userMenuOpen.set(false);
    this.auth.logout().subscribe({
      next: () => {},
      error: () => {
        // Aunque el backend falle, clearSession() ya redirige a /auth/login
      }
    });
  }
}
