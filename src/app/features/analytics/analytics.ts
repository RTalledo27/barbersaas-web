import {
  Component, inject, signal, computed, OnInit, ChangeDetectionStrategy,
} from '@angular/core';
import { DecimalPipe, NgClass, NgStyle } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgApexchartsModule } from 'ng-apexcharts';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  FinanceApiService, DailyPoint, PeakAnalysis, Comparison, FinanceSummary,
} from '../../core/api/finance-api.service';
import { ClientsApiService } from '../../core/api/clients-api.service';

// ── Types ─────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'year' | 'custom';

function toDateStr(d: Date): string { return d.toISOString().split('T')[0]; }

function periodRange(p: Period, cf: string, ct: string) {
  const now = new Date();
  if (p === 'week') {
    const day = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: toDateStr(mon), to: toDateStr(sun) };
  }
  if (p === 'month') {
    return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
             to:   toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  if (p === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
  return { from: cf, to: ct };
}

// ── Goal stored in localStorage ───────────────────────────────────────────

const GOAL_KEY = 'rev_monthly_goal';
function loadGoal(): number {
  const raw = localStorage.getItem(GOAL_KEY);
  const val = Number(raw ?? 0);
  return val > 0 ? val : 0;   // guard: never return 0 as a "set" goal
}
function saveGoal(v: number): void {
  if (v > 0) localStorage.setItem(GOAL_KEY, String(v));
  else        localStorage.removeItem(GOAL_KEY);
}

// ── Component ─────────────────────────────────────────────────────────────

@Component({
  selector:    'app-analytics',
  standalone:  true,
  imports:     [DecimalPipe, NgClass, NgStyle, FormsModule, NgApexchartsModule],
  templateUrl: './analytics.html',
  styleUrl:    './analytics.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent implements OnInit {
  private finApi    = inject(FinanceApiService);
  private clientApi = inject(ClientsApiService);

  // ── Period ────────────────────────────────────────────────────────────
  activePeriod = signal<Period>('month');
  customFrom   = signal('');
  customTo     = signal('');
  range = computed(() => periodRange(this.activePeriod(), this.customFrom(), this.customTo()));

  // ── Loading ───────────────────────────────────────────────────────────
  loading = signal(true);
  error   = signal('');

  // ── Data ──────────────────────────────────────────────────────────────
  summary      = signal<FinanceSummary | null>(null);
  dailyIncome  = signal<DailyPoint[]>([]);
  dailyExpense = signal<DailyPoint[]>([]);
  comparison   = signal<Comparison | null>(null);
  peak         = signal<PeakAnalysis | null>(null);
  topClients   = signal<any[]>([]);

  // ── Goal ──────────────────────────────────────────────────────────────
  goalValue    = signal(loadGoal());
  editingGoal  = signal(false);
  goalDraft    = signal(0);

  // ── Computed: cash flow chart ─────────────────────────────────────────
  cashFlowChart = computed(() => {
    const inc  = this.dailyIncome();
    const exp  = this.dailyExpense();
    if (!inc.length) return null;

    const labels  = inc.map(d => d.date.slice(5));
    const incData = inc.map(d => d.total);
    const expData = exp.map(d => d.total);

    // Accumulated net
    let acc = 0;
    const netData = incData.map((v, i) => { acc += v - (expData[i] ?? 0); return Math.round(acc * 100) / 100; });

    return {
      series: [
        { name: 'Ingresos',   type: 'bar',  data: incData },
        { name: 'Gastos',     type: 'bar',  data: expData },
        { name: 'Saldo neto', type: 'line', data: netData },
      ],
      chart:      { type: 'line' as const, height: 240, toolbar: { show: false }, background: 'transparent', stacked: false },
      stroke:     { width: [0, 0, 2.5], curve: 'smooth' as const },
      fill:       { opacity: [0.85, 0.85, 1] },
      colors:     ['#C9A84C', '#E5534B', '#4CC980'],
      plotOptions: { bar: { columnWidth: '60%', borderRadius: 3 } },
      xaxis:      { categories: labels, labels: { style: { colors: '#444', fontSize: '10px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis:      { labels: { style: { colors: '#444', fontSize: '10px' }, formatter: (v: number) => `S/${v.toFixed(0)}` } },
      grid:       { borderColor: '#161616', strokeDashArray: 3 },
      dataLabels: { enabled: false },
      tooltip:    { theme: 'dark', y: { formatter: (v: number) => `S/ ${v.toFixed(2)}` } },
      legend:     { labels: { colors: '#666' }, fontSize: '11px' },
    };
  });

  // ── Computed: avg ticket ──────────────────────────────────────────────
  avgTicket = computed(() => this.peak()?.avg_ticket ?? 0);

  // ── Computed: goal progress ───────────────────────────────────────────
  goalProgress = computed(() => {
    const goal   = this.goalValue();
    const income = this.summary()?.summary.total_income ?? 0;
    if (!goal) return 0;
    return Math.min((income / goal) * 100, 100);
  });

  // ── Computed: max peak values for bar widths ──────────────────────────
  maxDayCount  = computed(() => Math.max(...(this.peak()?.by_day.map(d => d.count) ?? [1]), 1));
  maxHourCount = computed(() => Math.max(...(this.peak()?.by_hour.map(h => h.count) ?? [1]), 1));

  // ── Computed: service margins ─────────────────────────────────────────
  serviceMargins = computed(() => {
    const s = this.summary();
    if (!s) return [];
    const totalComm = s.summary.total_commissions;
    const totalInc  = s.summary.total_income;
    return s.by_service.map(svc => {
      // Approximate commission attribution proportional to revenue
      const ratio   = totalInc > 0 ? svc.total / totalInc : 0;
      const commCut = totalComm * ratio;
      const margin  = svc.total - commCut;
      const pct     = svc.total > 0 ? (margin / svc.total) * 100 : 0;
      return { ...svc, margin: Math.round(margin * 100) / 100, margin_pct: Math.round(pct * 10) / 10 };
    }).sort((a, b) => b.margin_pct - a.margin_pct);
  });

  maxServiceMargin = computed(() =>
    Math.max(...this.serviceMargins().map(s => s.total), 1)
  );

  // ── Lifecycle ─────────────────────────────────────────────────────────

  ngOnInit(): void { this.loadAll(); }

  // ── Period ────────────────────────────────────────────────────────────

  setPeriod(p: Period): void {
    this.activePeriod.set(p);
    if (p !== 'custom') this.loadAll();
  }

  applyCustom(): void {
    if (this.customFrom() && this.customTo()) this.loadAll();
  }

  // ── Load ──────────────────────────────────────────────────────────────

  loadAll(): void {
    const { from, to } = this.range();
    if (!from || !to) return;
    this.loading.set(true);
    this.error.set('');

    const safe = (obs: any): import('rxjs').Observable<any> =>
      (obs as import('rxjs').Observable<any>).pipe(catchError(() => of(null)));

    forkJoin({
      summary:    safe(this.finApi.summary(from, to)),
      dailyInc:   safe(this.finApi.daily(from, to)),
      dailyExp:   safe(this.finApi.dailyExpenses(from, to)),
      comparison: safe(this.finApi.comparison(from, to)),
      peak:       safe(this.finApi.peakAnalysis(from, to)),
      topClients: safe(this.clientApi.list({ sort: 'total_spent', direction: 'desc', per_page: 10 })),
    }).subscribe({
      next: r => {
        if (r.summary)    this.summary.set(r.summary.data);
        if (r.dailyInc)   this.dailyIncome.set(r.dailyInc.data);
        if (r.dailyExp)   this.dailyExpense.set(r.dailyExp.data);
        if (r.comparison) this.comparison.set(r.comparison.data);
        if (r.peak)       this.peak.set(r.peak.data);
        if (r.topClients) this.topClients.set((r.topClients as any).data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Error cargando estadísticas.');
        this.loading.set(false);
      },
    });
  }

  // ── Goal ──────────────────────────────────────────────────────────────

  openGoalEdit(): void {
    this.goalDraft.set(this.goalValue());
    this.editingGoal.set(true);
  }

  saveGoal(): void {
    const v = Math.max(0, this.goalDraft());
    this.goalValue.set(v);
    saveGoal(v);
    this.editingGoal.set(false);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  changeBadge(v: number): { cls: string; icon: string } {
    return v >= 0
      ? { cls: 'up',   icon: '▲' }
      : { cls: 'down', icon: '▼' };
  }

  heatColor(count: number, max: number): string {
    if (!max) return '#0F0F0F';
    const pct = count / max;
    if (pct === 0)     return '#0F0F0F';
    if (pct < 0.25)    return '#1A1408';
    if (pct < 0.5)     return '#2E2210';
    if (pct < 0.75)    return '#614A20';
    return '#C9A84C';
  }
}
