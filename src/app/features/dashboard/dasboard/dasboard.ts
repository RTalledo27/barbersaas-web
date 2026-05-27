import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  WritableSignal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe, NgClass } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { NgApexchartsModule } from 'ng-apexcharts';
import type {
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexYAxis,
  ApexStroke,
  ApexFill,
  ApexDataLabels,
  ApexGrid,
  ApexTooltip,
  ApexMarkers,
} from 'ng-apexcharts';
import { API_URL } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';

// ─── Timeline constants ───────────────────────────────────────────────────
const TL_START = 9 * 60;    // 09:00 in minutes from midnight
const TL_END   = 20 * 60;   // 20:00
const TL_TOTAL = TL_END - TL_START; // 660 min

// ─── Interfaces ───────────────────────────────────────────────────────────

interface FinanceSummaryResp {
  success: boolean;
  data: {
    summary: { total_income: number; total_expenses: number; total_commissions: number; net_profit: number };
    by_employee: EmployeeStat[];
    by_service:  ServiceStat[];
  };
}

interface FinanceDailyResp {
  success: boolean;
  data: Array<{ date: string; total: number; count: number }>;
}

interface TodayResp {
  success: boolean;
  data: Appointment[];
  meta: AppointmentMeta;
}

interface AppointmentMeta {
  total: number; pending: number; confirmed: number; completed: number; cancelled: number;
}

interface Appointment {
  id:            string;
  date:          string;
  start_time:    string;
  end_time:      string;
  status:        string;
  status_label:  string;
  price_charged: number | null;
  client:   { id: string; name: string; phone: string };
  employee: { id: string; name: string; photo_url: string | null; color: string };
  service:  { id: string; name: string; duration_minutes: number; price: number };
}

interface EmployeeStat {
  employee_id: string; employee_name: string; photo_url: string | null; total: number; count: number;
}

interface ServiceStat {
  service_id: string; service_name: string; total: number; count: number; percent?: number;
}

interface TimelineEmployee {
  id: string; name: string; initial: string; color: string;
  appointments: TimelineBlock[];
}

interface TimelineBlock {
  id: string; clientName: string; clientInitial: string; serviceName: string;
  status: string; color: string; leftPct: number; widthPct: number;
  startMin: number; durationMin: number;
}

interface SmartAlert {
  id: string; type: 'warning' | 'info' | 'success';
  title: string; subtitle: string; actionLabel: string;
}

export type ChartOptions = {
  series: ApexAxisChartSeries; chart: ApexChart; colors: string[];
  stroke: ApexStroke; fill: ApexFill; dataLabels: ApexDataLabels;
  xaxis: ApexXAxis; yaxis: ApexYAxis; grid: ApexGrid;
  tooltip: ApexTooltip; markers: ApexMarkers;
};

// ─── Component ───────────────────────────────────────────────────────────

@Component({
  selector: 'app-dasboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgApexchartsModule, DecimalPipe, NgClass],
  templateUrl: './dasboard.html',
  styleUrl: './dasboard.css',
})
export class DasboardComponent implements OnInit, OnDestroy {
  private http       = inject(HttpClient);
  private auth       = inject(AuthService);
  private _destroyed = false;
  private _timer?: ReturnType<typeof setInterval>;

  // ── Auth / header ──────────────────────────────────────────────────────
  user      = this.auth.currentUser;
  firstName = computed(() => this.user()?.name?.split(' ')[0] ?? 'Admin');

  greeting = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  });

  dateLabel = computed(() =>
    new Date().toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  );

  // ── Timeline static config ─────────────────────────────────────────────
  readonly timelineHours = Array.from({ length: 12 }, (_, i) => ({
    h: 9 + i,
    label: `${(9 + i).toString().padStart(2, '0')}:00`,
    pct: (i / 11) * 100,
  }));

  // ── Reactive time (drives live card + timeline line) ───────────────────
  private _nowMin = signal(this._computeNowMin());

  currentTimeLabel = computed(() => {
    const n = this._nowMin();
    const h = Math.floor(n / 60);
    const m = n % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  });

  currentTimePct = computed(() => {
    const p = (this._nowMin() - TL_START) / TL_TOTAL * 100;
    return Math.max(0, Math.min(100, p));
  });

  // ── State ──────────────────────────────────────────────────────────────
  loading = signal(true);
  error   = signal<string | null>(null);

  // ── Live appointment ───────────────────────────────────────────────────
  liveAppointment = signal<Appointment | null>(null);

  liveProgress = computed(() => {
    const apt = this.liveAppointment();
    if (!apt) return 0;
    const start = this.toMin(apt.start_time);
    const end   = this.toMin(apt.end_time);
    const elapsed = this._nowMin() - start;
    return Math.min(100, Math.max(0, elapsed / (end - start) * 100));
  });

  liveElapsedMin = computed(() => {
    const apt = this.liveAppointment();
    if (!apt) return 0;
    return Math.max(0, this._nowMin() - this.toMin(apt.start_time));
  });

  liveDurationMin = computed(() => {
    const apt = this.liveAppointment();
    if (!apt) return 0;
    return this.toMin(apt.end_time) - this.toMin(apt.start_time);
  });

  liveTimeRemaining = computed(() => {
    const apt = this.liveAppointment();
    if (!apt) return 0;
    return Math.max(0, this.toMin(apt.end_time) - this._nowMin());
  });

  // ── KPI ────────────────────────────────────────────────────────────────
  animIncome    = signal(0);
  animCitas     = signal(0);
  animTicketAvg = signal(0);

  incomeChangePct  = signal<number | null>(null);
  ticketAvgDiff    = signal<number | null>(null);
  confirmedCount   = signal(0);
  inProgressCount  = signal(0);

  incomeSparkline = signal<number[]>([]);
  citasSparkline  = signal<number[]>([]);

  // ── Timeline ───────────────────────────────────────────────────────────
  timelineEmployees = signal<TimelineEmployee[]>([]);

  // ── Bottom data ────────────────────────────────────────────────────────
  appointmentsMeta = signal<AppointmentMeta>({ total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0 });
  upcomingAppts    = signal<Appointment[]>([]);
  recentActivity   = signal<Appointment[]>([]);
  topServices      = signal<ServiceStat[]>([]);
  featuredEmployee = signal<EmployeeStat | null>(null);
  alerts           = signal<SmartAlert[]>([]);

  // ── Chart ──────────────────────────────────────────────────────────────
  chartOptions = signal<ChartOptions>({
    series: [{ name: 'Ingresos', data: [] }],
    chart: { type: 'area', height: 200, toolbar: { show: false }, zoom: { enabled: false }, background: 'transparent', fontFamily: 'inherit', animations: { enabled: true, speed: 700 } },
    colors: ['#C9A84C'],
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.28, opacityTo: 0.0, stops: [0, 90, 100] } },
    dataLabels: { enabled: false },
    xaxis: { categories: [], labels: { style: { colors: '#5A5A5A', fontSize: '10px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: '#5A5A5A', fontSize: '10px' }, formatter: (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}` } },
    grid: { borderColor: 'rgba(255,255,255,0.04)', strokeDashArray: 4, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    tooltip: { theme: 'dark', y: { formatter: (v: number) => `$${v.toLocaleString('es-ES', { minimumFractionDigits: 0 })}` } },
    markers: { size: 3, colors: ['#C9A84C'], strokeColors: '#111', strokeWidth: 2, hover: { size: 5 } },
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadDashboard();
    this._timer = setInterval(() => {
      if (!this._destroyed) this._nowMin.set(this._computeNowMin());
    }, 60_000);
  }

  ngOnDestroy(): void {
    this._destroyed = true;
    clearInterval(this._timer);
  }

  refresh(): void { this.loadDashboard(); }

  // ── Data loading ───────────────────────────────────────────────────────
  private loadDashboard(): void {
    this.loading.set(true);
    this.error.set(null);

    const today     = this.dateStr(new Date());
    const yesterday = this.dateStr(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000));
    const weekAgo   = this.dateStr(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));

    forkJoin({
      today:     this.http.get<FinanceSummaryResp>(`${API_URL}/finance/summary`, { params: { from: today,     to: today     } }).pipe(catchError(() => of(null))),
      yesterday: this.http.get<FinanceSummaryResp>(`${API_URL}/finance/summary`, { params: { from: yesterday, to: yesterday } }).pipe(catchError(() => of(null))),
      week:      this.http.get<FinanceSummaryResp>(`${API_URL}/finance/summary`, { params: { from: weekAgo,   to: today     } }).pipe(catchError(() => of(null))),
      daily:     this.http.get<FinanceDailyResp>  (`${API_URL}/finance/daily`,   { params: { from: weekAgo,   to: today     } }).pipe(catchError(() => of(null))),
      appts:     this.http.get<TodayResp>          (`${API_URL}/appointments/today`).pipe(catchError(() => of(null))),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe(({ today: ts, yesterday: ys, week: ws, daily, appts }) => {

        // ── KPI: today income ─────────────────────────────────────
        const todayIncome = ts?.success ? ts.data.summary.total_income : 0;
        this.animate(this.animIncome, todayIncome);

        if (ys?.success) {
          const yIncome = ys.data.summary.total_income;
          if (yIncome > 0) {
            this.incomeChangePct.set(Math.round((todayIncome - yIncome) / yIncome * 100));
          }
        }

        // ── Sparklines ────────────────────────────────────────────
        if (daily?.success && daily.data.length) {
          this.incomeSparkline.set(daily.data.map(d => d.total));
          this.citasSparkline.set(daily.data.map(d => d.count));

          const cats = daily.data.map(d => this.shortDate(d.date));
          const vals = daily.data.map(d => d.total);
          this.chartOptions.update(o => ({
            ...o,
            series: [{ name: 'Ingresos', data: vals }],
            xaxis: { ...o.xaxis, categories: cats },
          }));
        }

        // ── Top services + employee (weekly) ──────────────────────
        if (ws?.success) {
          const sorted   = [...ws.data.by_service].sort((a, b) => b.count - a.count).slice(0, 5);
          const maxCount = sorted[0]?.count ?? 1;
          this.topServices.set(sorted.map(s => ({ ...s, percent: Math.round(s.count / maxCount * 100) })));

          const top = [...ws.data.by_employee].sort((a, b) => b.total - a.total)[0] ?? null;
          this.featuredEmployee.set(top);
        }

        // ── Appointments ──────────────────────────────────────────
        if (appts?.success) {
          const { meta, data } = appts;
          this.appointmentsMeta.set(meta);
          this.animate(this.animCitas, meta.total);

          // Ticket avg
          if (meta.completed > 0 && todayIncome > 0) {
            const avg = todayIncome / meta.completed;
            this.animate(this.animTicketAvg, avg);
            if (ys?.success && ys.data.summary.total_income > 0) {
              const prevAvg = ys.data.summary.total_income / Math.max(meta.completed, 1);
              this.ticketAvgDiff.set(Math.round((avg - prevAvg) * 100) / 100);
            }
          }

          // Confirmed + in-progress counts
          this.confirmedCount.set(meta.confirmed);
          const nowMin = this._nowMin();
          const inProgress = data.filter(a =>
            a.status === 'confirmed' &&
            this.toMin(a.start_time) <= nowMin &&
            this.toMin(a.end_time)   >= nowMin
          ).length;
          this.inProgressCount.set(inProgress);

          // Live appointment
          const live = data.find(a =>
            (a.status === 'confirmed' || a.status === 'pending') &&
            this.toMin(a.start_time) <= nowMin &&
            this.toMin(a.end_time)   >= nowMin
          ) ?? null;
          this.liveAppointment.set(live);

          // Timeline
          this.buildTimeline(data);

          // Upcoming
          this.upcomingAppts.set(
            data.filter(a => a.status === 'pending' || a.status === 'confirmed')
                .sort((a, b) => a.start_time.localeCompare(b.start_time))
                .slice(0, 5)
          );

          // Recent activity
          this.recentActivity.set(
            data.filter(a => ['completed', 'cancelled', 'no_show'].includes(a.status))
                .sort((a, b) => b.start_time.localeCompare(a.start_time))
                .slice(0, 5)
          );

          // Alerts
          this.buildAlerts(data);
        }
      });
  }

  // ── Actions ────────────────────────────────────────────────────────────

  completeLive(): void {
    const apt = this.liveAppointment();
    if (!apt) return;
    this.http.post(`${API_URL}/appointments/${apt.id}/complete`, {})
      .pipe(catchError(() => of(null)))
      .subscribe(() => this.loadDashboard());
  }

  confirmAppointment(id: string): void {
    this.http.post(`${API_URL}/appointments/${id}/confirm`, {})
      .pipe(catchError(() => of(null)))
      .subscribe(() => this.loadDashboard());
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private buildTimeline(appointments: Appointment[]): void {
    const empMap = new Map<string, TimelineEmployee>();

    for (const apt of appointments) {
      if (!apt.employee) continue;

      if (!empMap.has(apt.employee.id)) {
        empMap.set(apt.employee.id, {
          id:           apt.employee.id,
          name:         apt.employee.name.split(' ')[0],
          initial:      apt.employee.name.charAt(0).toUpperCase(),
          color:        apt.employee.color || this.colorFromId(apt.employee.id),
          appointments: [],
        });
      }

      const emp      = empMap.get(apt.employee.id)!;
      const startMin = this.toMin(apt.start_time);
      const endMin   = this.toMin(apt.end_time);
      const dur      = endMin - startMin;
      const leftPct  = Math.max(0,  (startMin - TL_START) / TL_TOTAL * 100);
      const widthPct = Math.min(100 - leftPct, dur / TL_TOTAL * 100);

      if (widthPct > 0) {
        emp.appointments.push({
          id:            apt.id,
          clientName:    apt.client.name,
          clientInitial: apt.client.name.charAt(0).toUpperCase(),
          serviceName:   apt.service.name,
          status:        apt.status,
          color:         apt.employee.color || this.colorFromId(apt.employee.id),
          leftPct,
          widthPct,
          startMin,
          durationMin: dur,
        });
      }
    }

    this.timelineEmployees.set(Array.from(empMap.values()));
  }

  private buildAlerts(appointments: Appointment[]): void {
    const list: SmartAlert[] = [];

    const pending = appointments.filter(a => a.status === 'pending');
    if (pending.length) {
      const times = pending.slice(0, 2).map(a => a.start_time).join(' y ');
      list.push({
        id: 'pending',
        type: 'warning',
        title: `${pending.length} ${pending.length === 1 ? 'cita sin confirmar' : 'citas sin confirmar'}`,
        subtitle: `Hoy ${times}`,
        actionLabel: 'Confirmar',
      });
    }

    const gapCount = this.detectGaps(appointments);
    if (gapCount > 0) {
      list.push({
        id: 'gaps',
        type: 'info',
        title: `${gapCount} ${gapCount === 1 ? 'hueco abierto' : 'huecos abiertos'} hoy`,
        subtitle: 'Tiempo sin ocupar disponible',
        actionLabel: 'Promover',
      });
    }

    const completed = appointments.filter(a => a.status === 'completed');
    if (completed.length > 0) {
      list.push({
        id: 'completed',
        type: 'success',
        title: `${completed.length} ${completed.length === 1 ? 'servicio completado' : 'servicios completados'}`,
        subtitle: 'Excelente ritmo de trabajo',
        actionLabel: 'Ver detalle',
      });
    }

    this.alerts.set(list);
  }

  private detectGaps(appointments: Appointment[]): number {
    const nowMin = this._nowMin();
    const byEmp = new Map<string, Appointment[]>();

    for (const apt of appointments) {
      if (!apt.employee || apt.status === 'cancelled' || apt.status === 'no_show') continue;
      const key = apt.employee.id;
      if (!byEmp.has(key)) byEmp.set(key, []);
      byEmp.get(key)!.push(apt);
    }

    let gaps = 0;
    for (const apts of byEmp.values()) {
      const sorted = [...apts].sort((a, b) => this.toMin(a.start_time) - this.toMin(b.start_time));
      for (let i = 0; i < sorted.length - 1; i++) {
        const gapStart = this.toMin(sorted[i].end_time);
        const gapEnd   = this.toMin(sorted[i + 1].start_time);
        const gapMin   = gapEnd - gapStart;
        if (gapMin >= 30 && gapEnd > nowMin) gaps++;
      }
    }
    return gaps;
  }

  private animate(sig: WritableSignal<number>, target: number, ms = 1100): void {
    const start = performance.now();
    const step  = (now: number): void => {
      if (this._destroyed) return;
      const t = Math.min((now - start) / ms, 1);
      sig.set(+(target * (1 - Math.pow(1 - t, 3))).toFixed(2));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ── Public helpers (used in template) ─────────────────────────────────

  sparklinePath(values: number[], w = 100, h = 44): string {
    if (values.length < 2) return '';
    const min   = Math.min(...values);
    const max   = Math.max(...values);
    const rng   = max - min || 1;
    const xStep = w / (values.length - 1);
    return values.map((v, i) => {
      const x = +(i * xStep).toFixed(1);
      const y = +(h - ((v - min) / rng) * (h * 0.82) - h * 0.08).toFixed(1);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }

  sparklineAreaPath(values: number[], w = 100, h = 44): string {
    if (values.length < 2) return '';
    const line  = this.sparklinePath(values, w, h);
    return `${line} L ${w} ${h} L 0 ${h} Z`;
  }

  getInitial(name: string): string {
    return (name ?? '?').charAt(0).toUpperCase();
  }

  statusClass(s: string): string {
    return ({ pending: 'st-pending', confirmed: 'st-confirmed', completed: 'st-completed', cancelled: 'st-cancelled', no_show: 'st-noshow' } as Record<string, string>)[s] ?? '';
  }

  alertClass(type: string): string {
    return ({ warning: 'alert-warning', info: 'alert-info', success: 'alert-success' } as Record<string, string>)[type] ?? '';
  }

  hasChartData(): boolean {
    const s = this.chartOptions().series[0] as { data: number[] };
    return (s?.data?.length ?? 0) > 0;
  }

  getFirstUpcoming(): Appointment | null {
    return this.upcomingAppts()[0] ?? null;
  }

  // ── Private utils ──────────────────────────────────────────────────────

  private toMin(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private _computeNowMin(): number {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }

  private dateStr(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  private shortDate(s: string): string {
    return new Date(s + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  private colorFromId(id: string): string {
    const colors = ['#C9A84C', '#6366F1', '#22C55E', '#F59E0B', '#EC4899', '#14B8A6', '#F97316'];
    let hash = 0;
    for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
    return colors[Math.abs(hash) % colors.length];
  }
}
