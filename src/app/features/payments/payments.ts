import {
  Component, OnInit, inject, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { FinanceApiService, IncomeRecord, CashierStats } from '../../core/api/finance-api.service';
import { EmployeesApiService, EmployeeLight } from '../../core/api/employees-api.service';
import { AppointmentsService } from '../../core/api/appointments.service';

interface PageMeta { current_page: number; last_page: number; per_page: number; total: number; }

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payments.html',
  styleUrl: './payments.css',
})
export class PaymentsComponent implements OnInit {
  private financeSvc = inject(FinanceApiService);
  private empSvc     = inject(EmployeesApiService);
  private apptSvc    = inject(AppointmentsService);

  // ── Estado ────────────────────────────────────────────────────────────
  loading       = signal(true);
  statsLoading  = signal(true);
  error         = signal<string | null>(null);

  // ── Datos ─────────────────────────────────────────────────────────────
  records    = signal<IncomeRecord[]>([]);
  stats      = signal<CashierStats | null>(null);
  employees  = signal<EmployeeLight[]>([]);
  meta       = signal<PageMeta | null>(null);

  // ── Filtros ───────────────────────────────────────────────────────────
  periodPreset  = signal<'today' | 'week' | 'month' | 'custom'>('month');
  filterFrom    = signal('');
  filterTo      = signal('');
  filterEmpId   = signal('');
  filterMethod  = signal('');
  filterVoucher = signal<'' | '0' | '1'>('');
  page          = signal(1);

  // ── Drawer detalle ────────────────────────────────────────────────────
  drawerRecord   = signal<IncomeRecord | null>(null);
  voucherUploading = signal(false);

  readonly METHODS = [
    { value: '',         label: 'Todos los métodos' },
    { value: 'cash',     label: 'Efectivo' },
    { value: 'card',     label: 'Tarjeta' },
    { value: 'transfer', label: 'Transferencia' },
    { value: 'yape',     label: 'Yape' },
    { value: 'plin',     label: 'Plin' },
  ];

  readonly METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
    yape: 'Yape', plin: 'Plin',
  };

  readonly STATUS_LABELS: Record<string, string> = {
    paid: 'Pagado', pending: 'Pendiente', partial: 'Parcial',
  };

  // ── Computed ──────────────────────────────────────────────────────────
  dateRangeLabel = computed(() => {
    const p = this.periodPreset();
    if (p === 'today') return 'Hoy';
    if (p === 'week')  return 'Esta semana';
    if (p === 'month') return 'Este mes';
    return `${this.filterFrom()} – ${this.filterTo()}`;
  });

  methodBreakdown = computed(() => {
    const s = this.stats();
    if (!s) return [];
    const total = s.total_income || 1;
    return Object.entries(s.by_method)
      .filter(([, v]) => v > 0)
      .map(([key, val]) => ({
        label: this.METHOD_LABELS[key] ?? key,
        value: val,
        pct:   Math.round((val / total) * 100),
      }))
      .sort((a, b) => b.value - a.value);
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.empSvc.list().subscribe(r => this.employees.set(r?.data ?? []));
    this.applyPreset('month');
  }

  // ── Período ───────────────────────────────────────────────────────────
  applyPreset(preset: 'today' | 'week' | 'month' | 'custom'): void {
    this.periodPreset.set(preset);
    if (preset === 'custom') return;

    const today = new Date();
    const fmt   = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'today') {
      this.filterFrom.set(fmt(today));
      this.filterTo.set(fmt(today));
    } else if (preset === 'week') {
      const mon = new Date(today);
      mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      this.filterFrom.set(fmt(mon));
      this.filterTo.set(fmt(today));
    } else {
      this.filterFrom.set(fmt(new Date(today.getFullYear(), today.getMonth(), 1)));
      this.filterTo.set(fmt(today));
    }

    this.page.set(1);
    this.load();
  }

  applyCustom(): void {
    if (!this.filterFrom() || !this.filterTo()) return;
    this.page.set(1);
    this.load();
  }

  // ── Carga ─────────────────────────────────────────────────────────────
  load(): void {
    this.loading.set(true);
    this.statsLoading.set(true);
    this.error.set(null);

    const from = this.filterFrom();
    const to   = this.filterTo();

    // KPIs
    this.financeSvc.cashierStats(from, to).subscribe({
      next: r  => { this.statsLoading.set(false); this.stats.set(r?.data ?? null); },
      error: () => this.statsLoading.set(false),
    });

    // Tabla
    const params: any = { from, to, page: this.page(), per_page: 25 };
    if (this.filterEmpId())   params.employee_id    = this.filterEmpId();
    if (this.filterMethod())  params.payment_method = this.filterMethod();
    if (this.filterVoucher()) params.has_voucher     = this.filterVoucher();

    this.financeSvc.income(params).subscribe({
      next: r => {
        this.loading.set(false);
        this.records.set(r?.data ?? []);
        this.meta.set(r?.meta ?? null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudieron cargar los cobros.');
      },
    });
  }

  onFilterChange(): void {
    this.page.set(1);
    this.load();
  }

  goPage(p: number): void {
    this.page.set(p);
    this.load();
  }

  pages(): number[] {
    const last = this.meta()?.last_page ?? 1;
    return Array.from({ length: last }, (_, i) => i + 1);
  }

  // ── Drawer ────────────────────────────────────────────────────────────
  openDrawer(r: IncomeRecord): void {
    this.drawerRecord.set(r);
  }

  closeDrawer(): void {
    this.drawerRecord.set(null);
  }

  // ── Voucher desde drawer ──────────────────────────────────────────────
  onVoucherSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    const rec   = this.drawerRecord();
    if (!file || !rec?.appointment_id) return;

    this.voucherUploading.set(true);
    this.apptSvc.uploadVoucher(rec.appointment_id, file).subscribe({
      next: r => {
        this.voucherUploading.set(false);
        // actualiza record local en drawer y en tabla
        const url = r.voucher_url;
        const updated = {
          ...rec,
          voucher_url: url,
          appointment: rec.appointment ? { ...rec.appointment, voucher_url: url } : rec.appointment,
        };
        this.drawerRecord.set(updated as IncomeRecord);
        this.records.update(list =>
          list.map(x => x.id === rec.id ? updated as IncomeRecord : x)
        );
      },
      error: () => this.voucherUploading.set(false),
    });
    input.value = '';
  }

  doDeleteVoucher(): void {
    const rec = this.drawerRecord();
    if (!rec?.appointment_id) return;
    this.voucherUploading.set(true);
    this.apptSvc.deleteVoucher(rec.appointment_id).subscribe({
      next: () => {
        this.voucherUploading.set(false);
        const updated = {
          ...rec,
          voucher_url: null,
          appointment: rec.appointment ? { ...rec.appointment, voucher_url: null } : rec.appointment,
        };
        this.drawerRecord.set(updated as IncomeRecord);
        this.records.update(list =>
          list.map(x => x.id === rec.id ? updated as IncomeRecord : x)
        );
      },
      error: () => this.voucherUploading.set(false),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  isPdf(url: string | null): boolean {
    return !!url && (url.endsWith('.pdf') || url.includes('/pdf'));
  }

  formatDate(d: string): string {
    if (!d) return '';
    return new Date(d + 'T12:00:00').toLocaleDateString('es-PE', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  statusColor(s: string | null): string {
    const map: Record<string, string> = {
      paid: '#059669', pending: '#D97706', partial: '#8B5CF6',
    };
    return map[s ?? ''] ?? '#6B7280';
  }

  methodIcon(m: string): string {
    const map: Record<string, string> = {
      cash: '💵', card: '💳', transfer: '🏦', yape: '📱', plin: '📱',
    };
    return map[m] ?? '💰';
  }

  empColor(id: string): string {
    return this.employees().find(e => e.id === id)?.color ?? '#C9A84C';
  }
}
