import { Component, inject, computed, OnInit } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { LayoutService } from '../layout.service';
import { AgendaBadgeService } from '../../services/agenda-badge.service';

interface NavItem {
  label: string;
  route: string;
  icon: string;
  badge?: string | number;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TitleCasePipe],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class SidebarComponent implements OnInit {
  private router  = inject(Router);
  private auth    = inject(AuthService);
  private layout  = inject(LayoutService);
  private badge   = inject(AgendaBadgeService);

  // ─── Estado de UI ────────────────────────────────────
  sidebarOpen = this.layout.sidebarOpen;

  // ─── Datos derivados del AuthService (fuente única) ──
  user        = this.auth.currentUser;
  tenant      = this.auth.currentTenant;
  tenantName  = computed(() => this.tenant()?.name ?? 'Mi Barbería');
  tenantPlan  = computed(() => this.tenant()?.plan ?? 'free');
  userName    = computed(() => this.user()?.name ?? 'Usuario');
  userEmail   = computed(() => this.user()?.email ?? '');
  userInitial = computed(() => (this.user()?.name?.charAt(0) ?? 'U').toUpperCase());
  tenantInitial = computed(() => (this.tenant()?.name?.charAt(0) ?? 'B').toUpperCase());

  /** Badge reactivo: citas pendientes+confirmadas hoy */
  agendaBadge = computed(() => {
    const n = this.badge.todayActive();
    return n !== null && n > 0 ? n : null;
  });

  ngOnInit(): void {
    this.badge.refresh();
  }

  // ─── Navegación ──────────────────────────────────────
  mainNav: NavItem[] = [
    { label: 'Dashboard',     route: '/app/dashboard',    icon: 'dashboard' },
    { label: 'Agenda',        route: '/app/appointments', icon: 'calendar' },
    { label: 'Clientes',      route: '/app/clients',      icon: 'users' },
    { label: 'Equipo',        route: '/app/team',         icon: 'team' },
    { label: 'Servicios',     route: '/app/services',     icon: 'scissors' },
    { label: 'Caja',          route: '/app/payments',     icon: 'cash' },
    { label: 'Ingresos',      route: '/app/revenue',      icon: 'wallet' },
    { label: 'Estadísticas',  route: '/app/analytics',    icon: 'chart' },
  ];

  bottomNav: NavItem[] = [
    { label: 'Configuración', route: '/app/settings', icon: 'settings' },
    { label: 'Ayuda',         route: '/app/help',     icon: 'help' },
  ];

  closeSidebar(): void {
    this.layout.closeSidebar();
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => {},
      error: () => {} // clearSession() ya redirige a /auth/login
    });
  }
}
