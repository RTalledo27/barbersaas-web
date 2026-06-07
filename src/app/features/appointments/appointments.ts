import {
  Component, OnInit, inject, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { AppointmentsService, Appointment } from '../../core/api/appointments.service';
import { EmployeesApiService, EmployeeLight } from '../../core/api/employees-api.service';
import { AppointmentModalComponent, ModalMode } from './appointment-modal/appointment-modal';
import { AgendaBadgeService } from '../../core/services/agenda-badge.service';

// ── Constantes de la grilla ────────────────────────────────────────────────
const GRID_START  = 8;   // 08:00
const GRID_END    = 21;  // 21:00
const HOUR_PX     = 80;  // px por hora
const TOTAL_MIN   = (GRID_END - GRID_START) * 60;

function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

@Component({
  selector: 'app-appointments',
  standalone: true,
  imports: [CommonModule, AppointmentModalComponent],
  templateUrl: './appointments.html',
  styleUrl: './appointments.css',
})
export class AppointmentsComponent implements OnInit {
  private apptSvc     = inject(AppointmentsService);
  private empSvc      = inject(EmployeesApiService);
  private agendaBadge = inject(AgendaBadgeService);

  // ── Estado ────────────────────────────────────────────────────────────
  loading      = signal(true);
  error        = signal<string | null>(null);
  view         = signal<'day' | 'list'>('day');
  selectedDate = signal(new Date());

  // ── Datos ─────────────────────────────────────────────────────────────
  appointments = signal<Appointment[]>([]);
  employees    = signal<EmployeeLight[]>([]);
  filterEmpId  = signal<string>('all');

  // ── Modal ─────────────────────────────────────────────────────────────
  modalOpen       = signal(false);
  modalMode       = signal<ModalMode>('create');
  modalAppointment = signal<Appointment | null>(null);
  prefillDate     = signal('');
  prefillEmpId    = signal('');

  // ── Grilla ────────────────────────────────────────────────────────────
  readonly hours = Array.from(
    { length: GRID_END - GRID_START },
    (_, i) => GRID_START + i
  );
  readonly gridHeight = TOTAL_MIN / 60 * HOUR_PX;

  // ── Computed ──────────────────────────────────────────────────────────
  selectedDateStr = computed(() => this.toDateStr(this.selectedDate()));

  selectedDateLabel = computed(() => {
    const d = this.selectedDate();
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const label = d.toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    return isToday ? `Hoy — ${label}` : label;
  });

  filteredEmployees = computed(() => {
    const id = this.filterEmpId();
    if (id === 'all') return this.employees();
    return this.employees().filter(e => e.id === id);
  });

  // Total de citas del día (header stats)
  totalToday = computed(() => this.appointments().length);
  pendingCount   = computed(() => this.appointments().filter(a => a.status === 'pending').length);
  confirmedCount = computed(() => this.appointments().filter(a => a.status === 'confirmed').length);
  completedCount = computed(() => this.appointments().filter(a => a.status === 'completed').length);

  // Hora actual para la línea roja
  nowPct = computed(() => {
    const d = this.selectedDate();
    const today = new Date();
    if (d.toDateString() !== today.toDateString()) return -1;
    const min = today.getHours() * 60 + today.getMinutes();
    const offset = min - GRID_START * 60;
    if (offset < 0 || offset > TOTAL_MIN) return -1;
    return (offset / TOTAL_MIN) * this.gridHeight;
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadEmployees();
    this.loadAppointments();
  }

  private loadEmployees(): void {
    this.empSvc.list().subscribe({
      next: r => this.employees.set(r?.data ?? []),
    });
  }

  loadAppointments(): void {
    this.loading.set(true);
    this.error.set(null);
    this.apptSvc.list({ date: this.selectedDateStr(), per_page: 100 }).subscribe({
      next: r => {
        this.loading.set(false);
        this.appointments.set(r?.data ?? []);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudieron cargar las citas.');
      },
    });
  }

  // ── Navegación de fechas ──────────────────────────────────────────────
  prevDay(): void {
    const d = new Date(this.selectedDate());
    d.setDate(d.getDate() - 1);
    this.selectedDate.set(d);
    this.loadAppointments();
  }

  nextDay(): void {
    const d = new Date(this.selectedDate());
    d.setDate(d.getDate() + 1);
    this.selectedDate.set(d);
    this.loadAppointments();
  }

  goToday(): void {
    this.selectedDate.set(new Date());
    this.loadAppointments();
  }

  isToday(): boolean {
    return this.selectedDate().toDateString() === new Date().toDateString();
  }

  // ── Datos por empleado ────────────────────────────────────────────────
  appointmentsForEmployee(empId: string): Appointment[] {
    return this.appointments().filter(a => a.employee.id === empId);
  }

  allAppointmentsSorted(): Appointment[] {
    return [...this.appointments()].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );
  }

  filteredListAppointments(): Appointment[] {
    const id = this.filterEmpId();
    const list = this.allAppointmentsSorted();
    return id === 'all' ? list : list.filter(a => a.employee.id === id);
  }

  // ── Posicionamiento en grilla ─────────────────────────────────────────
  aptTop(apt: Appointment): number {
    const startMin = toMin(apt.start_time);
    const offset   = startMin - GRID_START * 60;
    return Math.max(0, (offset / TOTAL_MIN) * this.gridHeight);
  }

  aptHeight(apt: Appointment): number {
    const start   = toMin(apt.start_time);
    const end     = toMin(apt.end_time);
    const dur     = Math.max(end - start, 30);            // mínimo 30 min para que quepa el contenido
    const px      = (dur / TOTAL_MIN) * this.gridHeight;
    return Math.max(px, 56);                              // nunca menos de 56px
  }

  // ── Modal ─────────────────────────────────────────────────────────────
  openNewModal(empId = '', date = ''): void {
    this.modalMode.set('create');
    this.modalAppointment.set(null);
    this.prefillDate.set(date || this.selectedDateStr());
    this.prefillEmpId.set(empId);
    this.modalOpen.set(true);
  }

  openDetail(apt: Appointment): void {
    this.modalMode.set('detail');
    this.modalAppointment.set(apt);
    this.modalOpen.set(true);
  }

  onModalClosed(): void {
    this.modalOpen.set(false);
  }

  onModalSaved(apt: Appointment): void {
    this.modalOpen.set(false);
    this.loadAppointments();
  }

  onStatusChanged(apt: Appointment): void {
    this.appointments.update(list =>
      list.map(a => a.id === apt.id ? apt : a)
    );
    this.modalAppointment.set(apt);
    // Refresca el badge del sidebar con el nuevo conteo real
    this.agendaBadge.refresh();
  }

  onColumnClick(event: MouseEvent, emp: EmployeeLight): void {
    // Click en espacio vacío → pre-rellenar empleado
    const target = event.target as HTMLElement;
    if (target.closest('.apt-block')) return;
    this.openNewModal(emp.id);
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  private toDateStr(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  formatTime(t: string): string {
    return t?.slice(0, 5) ?? '';
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      pending:     'Pendiente',
      confirmed:   'Confirmada',
      in_progress: 'En curso',
      completed:   'Completada',
      cancelled:   'Cancelada',
      no_show:     'No se presentó',
    };
    return map[s] ?? s;
  }

  statusColor(s: string): string {
    const map: Record<string, string> = {
      pending:     '#D97706',
      confirmed:   '#3B82F6',
      in_progress: '#8B5CF6',
      completed:   '#059669',
      cancelled:   '#DC2626',
      no_show:     '#6B7280',
    };
    return map[s] ?? '#6B7280';
  }

  trackByEmpId(_: number, e: EmployeeLight)  { return e.id; }
  trackByAptId(_: number, a: Appointment)     { return a.id; }
}
