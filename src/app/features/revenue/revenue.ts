import {
  Component, inject, signal, computed, OnInit, ChangeDetectionStrategy,
} from '@angular/core';
import { DecimalPipe, DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgApexchartsModule } from 'ng-apexcharts';
import {
  FinanceApiService,
  FinanceSummary, DailyPoint, IncomeRecord, Expense, Commission, Payout, PageMeta,
  CreateExpensePayload, Comparison, PeakAnalysis,
} from '../../core/api/finance-api.service';

// ── Types ─────────────────────────────────────────────────────────────────

type Tab       = 'resumen' | 'ingresos' | 'gastos' | 'comisiones' | 'pagos';
type Period    = 'today' | 'week' | 'month' | 'year' | 'custom';

const EXPENSE_CATEGORIES = [
  'Productos', 'Alquiler', 'Servicios', 'Nómina', 'Marketing',
  'Equipos', 'Mantenimiento', 'Impuestos', 'Otros',
];

const METHOD_LABELS: Record<string, string> = {
  cash:        'Efectivo',
  card:        'Tarjeta',
  transfer:    'Transferencia',
  yape:        'Yape',
  plin:        'Plin',
  other:       'Otro',
};

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

function periodRange(period: Period, custom: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  if (period === 'today') {
    const s = toDateString(now);
    return { from: s, to: s };
  }
  if (period === 'week') {
    const day  = now.getDay();
    const mon  = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7));
    const sun  = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: toDateString(mon), to: toDateString(sun) };
  }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toDateString(from), to: toDateString(to) };
  }
  if (period === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
  return custom;
}

// ── Component ─────────────────────────────────────────────────────────────

@Component({
  selector:    'app-revenue',
  standalone:  true,
  imports:     [DecimalPipe, DatePipe, NgClass, FormsModule, NgApexchartsModule],
  templateUrl: './revenue.html',
  styleUrl:    './revenue.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevenueComponent implements OnInit {
  private api = inject(FinanceApiService);

  // ── Period ────────────────────────────────────────────────────────────
  activePeriod  = signal<Period>('month');
  customFrom    = signal('');
  customTo      = signal('');
  readonly periodRange = computed(() =>
    periodRange(this.activePeriod(), { from: this.customFrom(), to: this.customTo() })
  );

  // ── Tab ───────────────────────────────────────────────────────────────
  activeTab = signal<Tab>('resumen');

  // ── Comparison + Peak ─────────────────────────────────────────────────
  comparison      = signal<Comparison | null>(null);
  peakData        = signal<PeakAnalysis | null>(null);
  loadingComparison = signal(false);

  // ── Loading ───────────────────────────────────────────────────────────
  loadingSummary  = signal(false);
  loadingDaily    = signal(false);
  loadingIncome   = signal(false);
  loadingExpenses = signal(false);
  loadingComm     = signal(false);
  loadingPayouts  = signal(false);
  error           = signal('');

  // ── Data ──────────────────────────────────────────────────────────────
  summary     = signal<FinanceSummary | null>(null);
  dailyData   = signal<DailyPoint[]>([]);
  incomeList  = signal<IncomeRecord[]>([]);
  incomeMeta  = signal<PageMeta>({ current_page: 1, last_page: 1, per_page: 20, total: 0 });
  expenseList = signal<Expense[]>([]);
  expenseMeta = signal<PageMeta>({ current_page: 1, last_page: 1, per_page: 20, total: 0 });
  commissions = signal<Commission[]>([]);
  payoutList  = signal<Payout[]>([]);
  payoutMeta  = signal<PageMeta>({ current_page: 1, last_page: 1, per_page: 20, total: 0 });

  // ── Chart ─────────────────────────────────────────────────────────────
  chartOptions = computed(() => {
    const data   = this.dailyData();
    const cats   = data.map(d => d.date.slice(5)); // MM-DD
    const series = data.map(d => d.total);
    const maxVal = Math.max(...series, 1);

    return {
      series:      [{ name: 'Ingresos', data: series }],
      chart:       { type: 'area' as const, height: 180, toolbar: { show: false }, sparkline: { enabled: false }, background: 'transparent' },
      stroke:      { curve: 'smooth' as const, width: 2, colors: ['#C9A84C'] },
      fill:        { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0, stops: [0, 100], colorStops: [{ offset: 0, color: '#C9A84C', opacity: 0.25 }, { offset: 100, color: '#C9A84C', opacity: 0 }] } },
      xaxis:       { categories: cats, labels: { style: { colors: '#444', fontSize: '10px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis:       { labels: { style: { colors: '#444', fontSize: '10px' }, formatter: (v: number) => `S/${v.toFixed(0)}` }, min: 0, max: maxVal * 1.15 },
      grid:        { borderColor: '#161616', strokeDashArray: 3, yaxis: { lines: { show: true } }, xaxis: { lines: { show: false } } },
      dataLabels:  { enabled: false },
      tooltip:     { theme: 'dark', y: { formatter: (v: number) => `S/ ${v.toFixed(2)}` } },
      markers:     { size: 3, colors: ['#C9A84C'], strokeColors: '#0A0A0A', strokeWidth: 2 },
    };
  });

  // ── Expense form ──────────────────────────────────────────────────────
  expenseDrawer = signal(false);
  savingExpense = signal(false);
  expenseForm: CreateExpensePayload = { category: 'Otros', description: '', amount: 0, date: '' };
  expenseFormError = signal('');
  deletingExpenseId = signal('');
  readonly CATEGORIES = EXPENSE_CATEGORIES;

  // ── Commission paying ─────────────────────────────────────────────────
  payingEmployeeId = signal('');

  // ── Helpers ───────────────────────────────────────────────────────────
  readonly methodLabel = (m: string) => METHOD_LABELS[m] ?? m;
  readonly initials    = (name: string) =>
    name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  formatDate(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatShortDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  }

  maxByService = computed(() => {
    const s = this.summary();
    if (!s?.by_service.length) return 1;
    return Math.max(...s.by_service.map(x => x.total));
  });

  maxByEmployee = computed(() => {
    const s = this.summary();
    if (!s?.by_employee.length) return 1;
    return Math.max(...s.by_employee.map(x => x.total));
  });

  profitPercent = computed(() => {
    const s = this.summary()?.summary;
    if (!s || s.total_income === 0) return 0;
    return (s.net_profit / s.total_income) * 100;
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadAll();
  }

  // ── Period change ─────────────────────────────────────────────────────

  setPeriod(p: Period): void {
    this.activePeriod.set(p);
    if (p !== 'custom') this.loadAll();
  }

  applyCustomRange(): void {
    if (this.customFrom() && this.customTo()) this.loadAll();
  }

  // ── Load ──────────────────────────────────────────────────────────────

  loadAll(): void {
    this.loadSummary();
    this.loadDaily();
    this.loadComparison();
    const tab = this.activeTab();
    if (tab === 'ingresos')   this.loadIncome(1);
    if (tab === 'gastos')     this.loadExpenses(1);
    if (tab === 'comisiones') this.loadCommissions();
    if (tab === 'pagos')      this.loadPayouts(1);
  }

  loadSummary(): void {
    const { from, to } = this.periodRange();
    if (!from || !to) return;
    this.loadingSummary.set(true);
    this.api.summary(from, to).subscribe({
      next:  r => { this.summary.set(r.data); this.loadingSummary.set(false); },
      error: () => { this.loadingSummary.set(false); },
    });
  }

  loadComparison(): void {
    const { from, to } = this.periodRange();
    if (!from || !to) return;
    this.loadingComparison.set(true);
    this.api.comparison(from, to).subscribe({
      next:  r => { this.comparison.set(r.data); this.loadingComparison.set(false); },
      error: () => this.loadingComparison.set(false),
    });
  }

  loadDaily(): void {
    const { from, to } = this.periodRange();
    if (!from || !to) return;
    this.loadingDaily.set(true);
    this.api.daily(from, to).subscribe({
      next:  r => { this.dailyData.set(r.data); this.loadingDaily.set(false); },
      error: () => { this.loadingDaily.set(false); },
    });
  }

  loadIncome(page = 1): void {
    const { from, to } = this.periodRange();
    this.loadingIncome.set(true);
    this.api.income({ from, to, page }).subscribe({
      next: r => {
        this.incomeList.set(r.data);
        this.incomeMeta.set(r.meta);
        this.loadingIncome.set(false);
      },
      error: () => this.loadingIncome.set(false),
    });
  }

  loadExpenses(page = 1): void {
    const { from, to } = this.periodRange();
    this.loadingExpenses.set(true);
    this.api.expenses({ from, to, page }).subscribe({
      next: r => {
        this.expenseList.set(r.data);
        this.expenseMeta.set(r.meta);
        this.loadingExpenses.set(false);
      },
      error: () => this.loadingExpenses.set(false),
    });
  }

  loadCommissions(): void {
    this.loadingComm.set(true);
    this.api.commissions().subscribe({
      next: r => { this.commissions.set(r.data); this.loadingComm.set(false); },
      error: () => this.loadingComm.set(false),
    });
  }

  loadPayouts(page = 1): void {
    const { from, to } = this.periodRange();
    this.loadingPayouts.set(true);
    this.api.payouts({ from, to, page }).subscribe({
      next: r => {
        this.payoutList.set(r.data);
        this.payoutMeta.set(r.meta);
        this.loadingPayouts.set(false);
      },
      error: () => this.loadingPayouts.set(false),
    });
  }

  // ── Tab switch ────────────────────────────────────────────────────────

  switchTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'ingresos'   && this.incomeList().length === 0)   this.loadIncome(1);
    if (tab === 'gastos'     && this.expenseList().length === 0)  this.loadExpenses(1);
    if (tab === 'comisiones' && this.commissions().length === 0)  this.loadCommissions();
    if (tab === 'pagos'      && this.payoutList().length === 0)   this.loadPayouts(1);
  }

  // ── Expense CRUD ──────────────────────────────────────────────────────

  openExpenseDrawer(): void {
    const today = toDateString(new Date());
    this.expenseForm = { category: 'Otros', description: '', amount: 0, date: today };
    this.expenseFormError.set('');
    this.expenseDrawer.set(true);
  }

  closeExpenseDrawer(): void { this.expenseDrawer.set(false); }

  saveExpense(): void {
    if (!this.expenseForm.description.trim()) {
      this.expenseFormError.set('La descripción es requerida.');
      return;
    }
    if (!this.expenseForm.amount || this.expenseForm.amount <= 0) {
      this.expenseFormError.set('El monto debe ser mayor a 0.');
      return;
    }
    if (!this.expenseForm.date) {
      this.expenseFormError.set('La fecha es requerida.');
      return;
    }
    this.savingExpense.set(true);
    this.expenseFormError.set('');
    this.api.createExpense(this.expenseForm).subscribe({
      next: r => {
        this.expenseList.update(list => [r.data, ...list]);
        this.expenseMeta.update(m => ({ ...m, total: m.total + 1 }));
        this.savingExpense.set(false);
        this.expenseDrawer.set(false);
        this.loadSummary();
      },
      error: () => {
        this.expenseFormError.set('Error al guardar el gasto.');
        this.savingExpense.set(false);
      },
    });
  }

  deleteExpense(id: string): void {
    this.deletingExpenseId.set(id);
    this.api.deleteExpense(id).subscribe({
      next: () => {
        this.expenseList.update(list => list.filter(e => e.id !== id));
        this.expenseMeta.update(m => ({ ...m, total: m.total - 1 }));
        this.deletingExpenseId.set('');
        this.loadSummary();
      },
      error: () => this.deletingExpenseId.set(''),
    });
  }

  // ── Pay commission ────────────────────────────────────────────────────

  payCommission(employeeId: string): void {
    this.payingEmployeeId.set(employeeId);
    this.api.payCommissions(employeeId).subscribe({
      next: () => {
        this.payingEmployeeId.set('');
        this.loadCommissions();
        this.loadSummary();
      },
      error: () => this.payingEmployeeId.set(''),
    });
  }
}
