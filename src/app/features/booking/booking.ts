import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  PublicBookingService,
  BookingTenant,
  BookingService,
  BookingEmployee,
  DayAvailability,
  TimeSlot,
  BookingResult,
} from '../../core/api/public-booking.service';

type Step = 'service' | 'employee' | 'datetime' | 'info' | 'done';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './booking.html',
  styleUrl: './booking.css',
})
export class BookingComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api   = inject(PublicBookingService);

  slug = '';

  // ── State ────────────────────────────────────────────────────
  step        = signal<Step>('service');
  loadingInit = signal(true);
  initError   = signal('');

  // Data
  tenant    = signal<BookingTenant | null>(null);
  services  = signal<BookingService[]>([]);
  employees = signal<BookingEmployee[]>([]);
  dayMap    = signal<Map<string, DayAvailability>>(new Map());
  slots     = signal<TimeSlot[]>([]);

  // Multi-selección de servicios
  selectedServices  = signal<BookingService[]>([]);
  selectedEmployee  = signal<BookingEmployee | null>(null);
  selectedDate      = signal('');
  selectedSlot      = signal<TimeSlot | null>(null);

  // Loading
  loadingEmployees = signal(false);
  loadingCalendar  = signal(false);
  loadingSlots     = signal(false);
  booking          = signal(false);
  bookError        = signal('');

  // Result
  result = signal<BookingResult | null>(null);

  // Form
  form = { name: '', phone: '', email: '', notes: '' };
  formErrors = signal<Record<string, string>>({});

  // Calendar
  calendarMonth = signal(new Date());

  // ── Computed totales ─────────────────────────────────────────
  totalPrice = computed(() =>
    this.selectedServices().reduce((s, svc) => s + Number(svc.price), 0)
  );

  totalDuration = computed(() =>
    this.selectedServices().reduce((s, svc) => s + svc.duration_minutes + (svc.buffer_minutes ?? 0), 0)
  );

  selectedServiceIds = computed(() =>
    this.selectedServices().map(s => s.id)
  );

  hasServices = computed(() => this.selectedServices().length > 0);

  // ── Calendar computed ─────────────────────────────────────────
  calendarDays = computed(() => {
    const month = this.calendarMonth();
    const year  = month.getFullYear();
    const mon   = month.getMonth();
    const first = new Date(year, mon, 1).getDay();
    const days  = new Date(year, mon + 1, 0).getDate();
    const cells: (number | null)[] = [];
    const offset = first === 0 ? 6 : first - 1;
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    return cells;
  });

  calendarMonthLabel = computed(() =>
    this.calendarMonth().toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
  );

  slotsAvailable = computed(() => this.slots().filter(s => s.available));

  selectedDateLabel = computed(() => this.formatDate(this.selectedDate()));

  tenantCurrency = computed(() => this.tenant()?.currency ?? 'PEN');

  today = new Date().toISOString().slice(0, 10);

  // ── Steps ─────────────────────────────────────────────────────
  steps: { key: Step; label: string }[] = [
    { key: 'service',  label: 'Servicios' },
    { key: 'employee', label: 'Barbero'   },
    { key: 'datetime', label: 'Fecha'     },
    { key: 'info',     label: 'Mis datos' },
  ];

  stepIndex = computed(() => {
    const map: Record<string, number> = { service: 0, employee: 1, datetime: 2, info: 3, done: 4 };
    return map[this.step()] ?? 0;
  });

  // ── Init ─────────────────────────────────────────────────────
  ngOnInit() {
    const host  = window.location.hostname;
    const parts = host.split('.');
    const isSubdomain = parts.length >= 3 && !['www', 'app', 'admin', 'api'].includes(parts[0]);
    this.slug = isSubdomain
      ? parts[0]
      : (this.route.snapshot.paramMap.get('slug') ?? '');

    this.api.getTenant(this.slug).subscribe({
      next: t => {
        this.tenant.set(t);
        this.api.getServices(this.slug).subscribe({
          next:  s => { this.services.set(s); this.loadingInit.set(false); },
          error: () => { this.initError.set('Error al cargar servicios.'); this.loadingInit.set(false); }
        });
      },
      error: () => { this.initError.set('Barbería no encontrada.'); this.loadingInit.set(false); }
    });
  }

  // ── Step 1: toggle servicios ──────────────────────────────────
  toggleService(svc: BookingService) {
    const current = this.selectedServices();
    const idx = current.findIndex(s => s.id === svc.id);
    if (idx >= 0) {
      this.selectedServices.set(current.filter(s => s.id !== svc.id));
    } else {
      this.selectedServices.set([...current, svc]);
    }
  }

  isServiceSelected(svc: BookingService): boolean {
    return this.selectedServices().some(s => s.id === svc.id);
  }

  goToEmployee() {
    if (!this.hasServices()) return;
    this.selectedEmployee.set(null);
    this.selectedDate.set('');
    this.selectedSlot.set(null);
    this.loadingEmployees.set(true);
    this.step.set('employee');

    this.api.getEmployees(this.slug, this.selectedServiceIds()).subscribe({
      next:  e => { this.employees.set(e); this.loadingEmployees.set(false); },
      error: () => this.loadingEmployees.set(false),
    });
  }

  // ── Step 2: barbero ───────────────────────────────────────────
  selectEmployee(e: BookingEmployee) {
    this.selectedEmployee.set(e);
    this.selectedDate.set('');
    this.selectedSlot.set(null);
    this.step.set('datetime');
    this.loadCalendarMonth();
  }

  // ── Step 3: calendario ────────────────────────────────────────
  loadCalendarMonth() {
    const emp = this.selectedEmployee();
    if (!emp || !this.hasServices()) return;

    const m    = this.calendarMonth();
    const year = m.getFullYear();
    const mon  = m.getMonth();
    const firstOfMonth = new Date(year, mon, 1).toISOString().slice(0, 10);
    // No pedir fechas pasadas — from = max(hoy, primer día del mes)
    const from = firstOfMonth < this.today ? this.today : firstOfMonth;
    const to   = new Date(year, mon + 1, 0).toISOString().slice(0, 10);

    this.loadingCalendar.set(true);
    this.api.getAvailabilityRange(this.slug, emp.id, this.selectedServiceIds(), from, to).subscribe({
      next: days => {
        const map = new Map<string, DayAvailability>();
        (Array.isArray(days) ? days : Object.values(days as object)).forEach((d: any) => map.set(d.date, d));
        this.dayMap.set(map);
        this.loadingCalendar.set(false);
      },
      error: () => this.loadingCalendar.set(false),
    });
  }

  prevMonth() {
    const m = this.calendarMonth();
    this.calendarMonth.set(new Date(m.getFullYear(), m.getMonth() - 1, 1));
    this.loadCalendarMonth();
  }

  nextMonth() {
    const m = this.calendarMonth();
    this.calendarMonth.set(new Date(m.getFullYear(), m.getMonth() + 1, 1));
    this.loadCalendarMonth();
  }

  isPastDay(day: number): boolean {
    const m = this.calendarMonth();
    return new Date(m.getFullYear(), m.getMonth(), day).toISOString().slice(0, 10) < this.today;
  }

  isDayAvailable(day: number): boolean {
    const info = this.dayMap().get(this.dateKey(day));
    return !!(info?.available && info.slots_count > 0);
  }

  dateKey(day: number): string {
    const m = this.calendarMonth();
    return new Date(m.getFullYear(), m.getMonth(), day).toISOString().slice(0, 10);
  }

  selectDay(day: number) {
    if (this.isPastDay(day) || !this.isDayAvailable(day)) return;
    const date = this.dateKey(day);
    this.selectedDate.set(date);
    this.selectedSlot.set(null);
    this.slots.set([]);
    this.loadingSlots.set(true);

    this.api.getSlots(this.slug, this.selectedEmployee()!.id, this.selectedServiceIds(), date).subscribe({
      next:  s => { this.slots.set(s); this.loadingSlots.set(false); },
      error: () => this.loadingSlots.set(false),
    });
  }

  selectSlot(slot: TimeSlot) {
    if (!slot.available) return;
    this.selectedSlot.set(slot);
  }

  goToInfo() {
    if (!this.selectedSlot()) return;
    this.step.set('info');
  }

  // ── Step 4: confirmar ─────────────────────────────────────────
  validateForm(): boolean {
    const errs: Record<string, string> = {};
    if (!this.form.name.trim())  errs['name']  = 'El nombre es obligatorio';
    if (!this.form.phone.trim()) errs['phone'] = 'El teléfono es obligatorio';
    else if (!/^\+?[\d\s\-()]{6,20}$/.test(this.form.phone)) errs['phone'] = 'Teléfono inválido';
    this.formErrors.set(errs);
    return Object.keys(errs).length === 0;
  }

  confirmBooking() {
    if (!this.validateForm()) return;
    this.booking.set(true);
    this.bookError.set('');

    this.api.book(this.slug, {
      service_ids:  this.selectedServiceIds(),
      employee_id:  this.selectedEmployee()!.id,
      date:         this.selectedDate(),
      start_time:   this.selectedSlot()!.start,
      client_name:  this.form.name.trim(),
      client_phone: this.form.phone.trim(),
      client_email: this.form.email.trim() || undefined,
      client_notes: this.form.notes.trim() || undefined,
    }).subscribe({
      next: r => { this.result.set(r); this.booking.set(false); this.step.set('done'); },
      error: err => {
        this.bookError.set(err.error?.error?.message ?? 'Error al reservar. Intenta de nuevo.');
        this.booking.set(false);
      }
    });
  }

  // ── Navigation ────────────────────────────────────────────────
  goBack() {
    const map: Record<string, Step> = { employee: 'service', datetime: 'employee', info: 'datetime' };
    const prev = map[this.step()];
    if (prev) this.step.set(prev);
  }

  // ── Helpers ───────────────────────────────────────────────────
  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  formatPrice(n: number, currency = 'PEN'): string {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(n);
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }

  initial(name: string): string {
    return (name?.charAt(0) ?? '?').toUpperCase();
  }
}
