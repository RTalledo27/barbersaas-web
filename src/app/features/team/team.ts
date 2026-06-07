import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  EmployeesApiService,
  Employee,
  ScheduleDay,
  CreateEmployeePayload,
} from '../../core/api/employees-api.service';
import { ServicesApiService, ServiceCatalog } from '../../core/api/services-api.service';

type DrawerTab = 'info' | 'schedule';
type DrawerMode = 'create' | 'edit';

interface ScheduleRow {
  day_of_week: number;
  day_name:    string;
  is_active:   boolean;
  start_time:  string;
  end_time:    string;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './team.html',
  styleUrl: './team.css',
})
export class TeamComponent implements OnInit {
  private empSvc = inject(EmployeesApiService);
  private svcApi = inject(ServicesApiService);

  // ── Estado ────────────────────────────────────────────────────────────
  loading   = signal(true);
  error     = signal<string | null>(null);
  saving    = signal(false);
  deleting  = signal<string | null>(null);
  savingSched = signal(false);

  employees = signal<Employee[]>([]);
  services  = signal<ServiceCatalog[]>([]);

  // ── Filtros ───────────────────────────────────────────────────────────
  filterActive = signal<'all' | 'active' | 'inactive'>('active');
  searchQuery  = signal('');

  // ── Drawer ────────────────────────────────────────────────────────────
  drawerOpen = signal(false);
  drawerMode = signal<DrawerMode>('create');
  drawerTab  = signal<DrawerTab>('info');
  editingId  = signal<string | null>(null);
  formError  = signal<string | null>(null);
  schedError = signal<string | null>(null);

  form: CreateEmployeePayload & { service_ids: string[] } = {
    name:             '',
    bio:              '',
    color:            '#C9A84C',
    commission_type:  null,
    commission_value: 0,
    is_active:        true,
    service_ids:      [],
  };

  schedule: ScheduleRow[] = this.defaultSchedule();

  // ── Delete confirm ────────────────────────────────────────────────────
  deleteConfirmId   = signal<string | null>(null);
  deleteConfirmName = signal('');

  // ── Computed ──────────────────────────────────────────────────────────
  filtered = computed(() => {
    let list = this.employees();
    const q   = this.searchQuery().toLowerCase().trim();
    const act = this.filterActive();

    if (q)   list = list.filter(e => e.name.toLowerCase().includes(q));
    if (act === 'active')   list = list.filter(e => e.is_active);
    if (act === 'inactive') list = list.filter(e => !e.is_active);
    return list;
  });

  totalActive   = computed(() => this.employees().filter(e => e.is_active).length);
  totalInactive = computed(() => this.employees().filter(e => !e.is_active).length);

  // ── Lifecycle ─────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.load();
    this.loadServices();
  }

  load(): void {
    this.loading.set(true);
    this.empSvc.listAll().subscribe({
      next: r => {
        this.loading.set(false);
        this.employees.set(r?.data ?? []);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudieron cargar los empleados.');
      },
    });
  }

  private loadServices(): void {
    this.svcApi.list(false).subscribe({
      next: r => this.services.set(r?.data ?? []),
    });
  }

  // ── Drawer ────────────────────────────────────────────────────────────
  openCreate(): void {
    this.drawerMode.set('create');
    this.editingId.set(null);
    this.drawerTab.set('info');
    this.formError.set(null);
    this.schedError.set(null);
    this.form = {
      name: '', bio: '', color: '#C9A84C',
      commission_type: null, commission_value: 0,
      is_active: true, service_ids: [],
    };
    this.schedule = this.defaultSchedule();
    this.drawerOpen.set(true);
  }

  openEdit(emp: Employee): void {
    this.drawerMode.set('edit');
    this.editingId.set(emp.id);
    this.drawerTab.set('info');
    this.formError.set(null);
    this.schedError.set(null);
    this.form = {
      name:             emp.name,
      bio:              emp.bio ?? '',
      color:            emp.color ?? '#C9A84C',
      commission_type:  emp.commission_type ?? null,
      commission_value: emp.commission_value ?? 0,
      is_active:        emp.is_active,
      service_ids:      (emp.services ?? []).map(s => s.id),
    };
    // load schedule from employee data
    this.schedule = this.scheduleFromApi(emp.schedules ?? []);
    // reload fresh schedule from API
    this.empSvc.getSchedule(emp.id).subscribe({
      next: r => { this.schedule = this.scheduleFromApi(r?.data ?? []); },
    });
    this.drawerOpen.set(true);
  }

  closeDrawer(): void { this.drawerOpen.set(false); }

  // ── Info form submit ──────────────────────────────────────────────────
  onSubmitInfo(): void {
    if (!this.form.name.trim()) {
      this.formError.set('El nombre del empleado es obligatorio.');
      return;
    }
    this.saving.set(true);
    this.formError.set(null);

    const payload: any = {
      name:             this.form.name.trim(),
      bio:              this.form.bio?.trim() || undefined,
      color:            this.form.color,
      commission_type:  this.form.commission_type || undefined,
      commission_value: Number(this.form.commission_value) || 0,
      is_active:        this.form.is_active,
      service_ids:      this.form.service_ids,
    };

    const req = this.drawerMode() === 'create'
      ? this.empSvc.create(payload)
      : this.empSvc.update(this.editingId()!, payload);

    req.subscribe({
      next: r => {
        this.saving.set(false);
        if (this.drawerMode() === 'create') {
          // after create, switch to schedule tab with the new employee id
          const newId = r?.data?.id;
          if (newId) {
            this.editingId.set(newId);
            this.drawerMode.set('edit');
            this.drawerTab.set('schedule');
          } else {
            this.closeDrawer();
          }
        } else {
          this.drawerTab.set('schedule');
        }
        this.load();
      },
      error: err => {
        this.saving.set(false);
        const msg = err?.error?.message ?? err?.error?.errors
          ? Object.values(err.error.errors as Record<string, string[]>).flat().join(' ')
          : 'Error al guardar.';
        this.formError.set(msg);
      },
    });
  }

  // ── Schedule submit ───────────────────────────────────────────────────
  onSubmitSchedule(): void {
    const id = this.editingId();
    if (!id) return;

    // validate
    for (const row of this.schedule) {
      if (row.is_active && (!row.start_time || !row.end_time)) {
        this.schedError.set(`Completa el horario del ${row.day_name}.`);
        return;
      }
    }

    this.savingSched.set(true);
    this.schedError.set(null);

    const activeDays = this.schedule
      .filter(r => r.is_active)
      .map(r => ({
        day_of_week: r.day_of_week,
        start_time:  r.start_time,
        end_time:    r.end_time,
        is_active:   true,
      }));

    this.empSvc.updateSchedule(id, activeDays).subscribe({
      next: r => {
        this.savingSched.set(false);
        this.schedule = this.scheduleFromApi(r?.data ?? []);
        this.closeDrawer();
      },
      error: err => {
        this.savingSched.set(false);
        this.schedError.set(err?.error?.error?.message ?? 'Error al guardar el horario.');
      },
    });
  }

  // ── Toggle active ─────────────────────────────────────────────────────
  toggleActive(emp: Employee): void {
    this.empSvc.update(emp.id, { is_active: !emp.is_active }).subscribe({
      next: () => this.load(),
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────
  askDelete(emp: Employee): void {
    this.deleteConfirmId.set(emp.id);
    this.deleteConfirmName.set(emp.name);
  }

  confirmDelete(): void {
    const id = this.deleteConfirmId();
    if (!id) return;
    this.deleting.set(id);
    this.empSvc.delete(id).subscribe({
      next: () => {
        this.deleting.set(null);
        this.deleteConfirmId.set(null);
        this.load();
      },
      error: err => {
        this.deleting.set(null);
        this.deleteConfirmId.set(null);
        alert(err?.error?.error?.message ?? 'No se pudo eliminar el empleado.');
      },
    });
  }

  cancelDelete(): void { this.deleteConfirmId.set(null); }

  // ── Service toggle ────────────────────────────────────────────────────
  toggleService(svcId: string): void {
    const idx = this.form.service_ids.indexOf(svcId);
    if (idx === -1) this.form.service_ids = [...this.form.service_ids, svcId];
    else            this.form.service_ids = this.form.service_ids.filter(id => id !== svcId);
  }

  hasService(svcId: string): boolean {
    return this.form.service_ids.includes(svcId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  private defaultSchedule(): ScheduleRow[] {
    return DAY_NAMES.map((name, i) => ({
      day_of_week: i,
      day_name:    name,
      is_active:   i >= 1 && i <= 6, // Lun-Sáb default
      start_time:  '09:00',
      end_time:    '19:00',
    }));
  }

  private scheduleFromApi(apiDays: ScheduleDay[]): ScheduleRow[] {
    return DAY_NAMES.map((name, i) => {
      const day = apiDays.find(d => d.day_of_week === i);
      return {
        day_of_week: i,
        day_name:    name,
        is_active:   day?.is_active ?? false,
        start_time:  day?.start_time ?? '09:00',
        end_time:    day?.end_time   ?? '19:00',
      };
    });
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  commissionLabel(emp: Employee): string {
    if (!emp.commission_type) return '—';
    if (emp.commission_type === 'percentage') return `${emp.commission_value}%`;
    return `S/ ${emp.commission_value}`;
  }

  activeDayCount(emp: Employee): number {
    return (emp.schedules ?? []).filter(s => s.is_active).length;
  }
}
