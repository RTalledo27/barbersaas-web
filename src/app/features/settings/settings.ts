import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';

interface TenantData {
  id:           string;
  name:         string;
  slug:         string;
  email:        string;
  phone:        string | null;
  logo_url:     string | null;
  address:      string | null;
  city:         string | null;
  country_code: string | null;
  timezone:     string | null;
  currency:     string | null;
  status:       string;
  plan:         { name: string; max_employees: number; max_services: number } | null;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  // ── Estado ───────────────────────────────────────────────────────────
  loading  = signal(true);
  saving   = signal(false);
  success  = signal<string | null>(null);
  error    = signal<string | null>(null);
  activeTab = signal<'general' | 'localization' | 'plan'>('general');

  // ── Datos ────────────────────────────────────────────────────────────
  tenant = signal<TenantData | null>(null);

  // ── Formulario ───────────────────────────────────────────────────────
  form = {
    name:         '',
    email:        '',
    phone:        '',
    logo_url:     '',
    address:      '',
    city:         '',
    country_code: '',
    timezone:     '',
    currency:     '',
  };

  readonly TIMEZONES = [
    'America/Lima', 'America/Bogota', 'America/Santiago',
    'America/Buenos_Aires', 'America/Mexico_City', 'America/New_York',
    'America/Los_Angeles', 'Europe/Madrid', 'UTC',
  ];

  readonly CURRENCIES = [
    { code: 'PEN', label: 'Sol peruano (S/)' },
    { code: 'COP', label: 'Peso colombiano ($)' },
    { code: 'CLP', label: 'Peso chileno ($)' },
    { code: 'ARS', label: 'Peso argentino ($)' },
    { code: 'MXN', label: 'Peso mexicano ($)' },
    { code: 'USD', label: 'Dólar (US$)' },
    { code: 'EUR', label: 'Euro (€)' },
  ];

  readonly COUNTRIES = [
    { code: 'PE', label: 'Perú' },
    { code: 'CO', label: 'Colombia' },
    { code: 'CL', label: 'Chile' },
    { code: 'AR', label: 'Argentina' },
    { code: 'MX', label: 'México' },
    { code: 'US', label: 'Estados Unidos' },
    { code: 'ES', label: 'España' },
  ];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.http.get<any>(`${API_URL}/tenant`).subscribe({
      next: r => {
        this.loading.set(false);
        const t: TenantData = r?.data;
        this.tenant.set(t);
        // Poblar formulario
        this.form = {
          name:         t.name         ?? '',
          email:        t.email        ?? '',
          phone:        t.phone        ?? '',
          logo_url:     t.logo_url     ?? '',
          address:      t.address      ?? '',
          city:         t.city         ?? '',
          country_code: t.country_code ?? '',
          timezone:     t.timezone     ?? 'America/Lima',
          currency:     t.currency     ?? 'PEN',
        };
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudo cargar la configuración.');
      },
    });
  }

  save(): void {
    this.saving.set(true);
    this.success.set(null);
    this.error.set(null);

    // Solo enviar campos no vacíos
    const payload: any = {};
    if (this.form.name)         payload.name         = this.form.name;
    if (this.form.email)        payload.email        = this.form.email;
    if (this.form.phone)        payload.phone        = this.form.phone;
    if (this.form.logo_url)     payload.logo_url     = this.form.logo_url;
    if (this.form.address)      payload.address      = this.form.address;
    if (this.form.city)         payload.city         = this.form.city;
    if (this.form.country_code) payload.country_code = this.form.country_code;
    if (this.form.timezone)     payload.timezone     = this.form.timezone;
    if (this.form.currency)     payload.currency     = this.form.currency;

    this.http.put<any>(`${API_URL}/tenant`, payload).subscribe({
      next: r => {
        this.saving.set(false);
        this.tenant.set(r?.data);
        this.success.set('Configuración guardada correctamente.');
        // Actualizar auth si cambia el nombre del tenant
        setTimeout(() => this.success.set(null), 3000);
      },
      error: err => {
        this.saving.set(false);
        const msg = err?.error?.message ?? err?.error?.error?.message ?? 'Error al guardar.';
        this.error.set(msg);
      },
    });
  }

  planLabel(): string {
    const plan = this.tenant()?.plan?.name ?? 'free';
    const map: Record<string, string> = {
      free: 'Plan Gratuito', basic: 'Plan Básico',
      pro: 'Plan Pro', enterprise: 'Plan Enterprise',
    };
    return map[plan.toLowerCase()] ?? plan;
  }

  planColor(): string {
    const plan = this.tenant()?.plan?.name ?? 'free';
    const map: Record<string, string> = {
      free: '#6B7280', basic: '#3B82F6', pro: '#C9A84C', enterprise: '#8B5CF6',
    };
    return map[plan.toLowerCase()] ?? '#6B7280';
  }

  logoInitial(): string {
    return (this.tenant()?.name?.charAt(0) ?? 'B').toUpperCase();
  }
}
