import {
  Component, Input, Output, EventEmitter,
  OnInit, inject, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap, of } from 'rxjs';

import { AppointmentsService, Appointment, AvailableSlot, CreateAppointmentPayload } from '../../../core/api/appointments.service';
import { EmployeesApiService, EmployeeLight } from '../../../core/api/employees-api.service';
import { ServicesApiService, ServiceCatalog } from '../../../core/api/services-api.service';
import { ClientsApiService, ClientLight } from '../../../core/api/clients-api.service';

export type ModalMode = 'create' | 'detail';

@Component({
  selector: 'app-appointment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './appointment-modal.html',
  styleUrl: './appointment-modal.css',
})
export class AppointmentModalComponent implements OnInit {
  @Input() mode: ModalMode = 'create';
  @Input() appointment: Appointment | null = null;
  @Input() prefillDate: string = '';
  @Input() prefillEmployeeId: string = '';

  @Output() closed     = new EventEmitter<void>();
  @Output() saved      = new EventEmitter<Appointment>();
  @Output() statusChanged = new EventEmitter<Appointment>();

  private apptSvc     = inject(AppointmentsService);
  private empSvc      = inject(EmployeesApiService);
  private svcSvc      = inject(ServicesApiService);
  private clientSvc   = inject(ClientsApiService);

  // ── Estado general ─────────────────────────────────────────────────────
  loading       = signal(false);
  loadingSlots  = signal(false);
  actionLoading = signal<string | null>(null);
  error         = signal<string | null>(null);

  // ── Datos de catálogos ─────────────────────────────────────────────────
  employees  = signal<EmployeeLight[]>([]);
  services   = signal<ServiceCatalog[]>([]);
  clients    = signal<ClientLight[]>([]);
  slots      = signal<AvailableSlot[]>([]);

  // ── Búsqueda de clientes ───────────────────────────────────────────────
  clientSearch    = signal('');
  clientResults   = signal<ClientLight[]>([]);
  clientSearching = signal(false);
  private search$ = new Subject<string>();

  // ── Formulario ─────────────────────────────────────────────────────────
  form = {
    client_id:     '',
    client_name:   '',
    employee_id:   '',
    service_id:    '',
    date:          '',
    start_time:    '',
    price_charged: 0,
    notes:         '',
  };

  // ── Cancel form ────────────────────────────────────────────────────────
  showCancelForm = signal(false);
  cancelReason   = '';

  // ── Complete form ──────────────────────────────────────────────────────
  showCompleteForm  = signal(false);
  completePayStatus = 'paid';          // paid | pending | partial
  completePayMethod = 'cash';          // cash | card | transfer | yape | plin

  // ── Voucher ────────────────────────────────────────────────────────────
  voucherLoading = signal(false);
  voucherPreview = signal<string | null>(null);   // preview local (objectURL)

  readonly PAY_STATUSES = [
    { value: 'paid',    label: 'Pagado',       icon: '✓' },
    { value: 'pending', label: 'Pendiente',    icon: '⏳' },
    { value: 'partial', label: 'Pago parcial', icon: '◑' },
  ];
  readonly PAY_METHODS = [
    { value: 'cash',     label: 'Efectivo'       },
    { value: 'card',     label: 'Tarjeta'         },
    { value: 'transfer', label: 'Transferencia'   },
    { value: 'yape',     label: 'Yape'            },
    { value: 'plin',     label: 'Plin'            },
  ];

  // ── Computed para detail ───────────────────────────────────────────────
  statusColor = computed(() => {
    const s = this.appointment?.status;
    const map: Record<string, string> = {
      pending:     '#D97706',
      confirmed:   '#3B82F6',
      in_progress: '#8B5CF6',
      completed:   '#059669',
      cancelled:   '#DC2626',
      no_show:     '#6B7280',
    };
    return s ? (map[s] ?? '#6B7280') : '#6B7280';
  });

  canConfirm    = computed(() => this.appointment?.status === 'pending');
  canComplete   = computed(() => this.appointment?.status === 'confirmed' || this.appointment?.status === 'in_progress');
  canCancel     = computed(() => ['pending', 'confirmed'].includes(this.appointment?.status ?? ''));
  canNoShow     = computed(() => this.appointment?.status === 'confirmed');
  isTerminal    = computed(() => ['completed', 'cancelled', 'no_show'].includes(this.appointment?.status ?? ''));

  ngOnInit(): void {
    if (this.mode === 'create') {
      this.loadCatalogs();
      this.form.date        = this.prefillDate;
      this.form.employee_id = this.prefillEmployeeId;

      // Búsqueda de clientes con debounce
      this.search$.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(q => {
          if (!q || q.length < 2) return of({ success: true, data: [] });
          this.clientSearching.set(true);
          return this.clientSvc.search(q);
        }),
      ).subscribe(res => {
        this.clientSearching.set(false);
        this.clientResults.set(res?.data ?? []);
      });
    }
  }

  private loadCatalogs(): void {
    this.empSvc.list().subscribe(r => this.employees.set(r?.data ?? []));
    this.svcSvc.list().subscribe(r => this.services.set(r?.data ?? []));
  }

  // ── Búsqueda de clientes ───────────────────────────────────────────────
  onClientInput(val: string): void {
    this.clientSearch.set(val);
    if (!val) { this.clientResults.set([]); return; }
    this.search$.next(val);
  }

  selectClient(c: ClientLight): void {
    this.form.client_id   = c.id;
    this.form.client_name = c.name;
    this.clientResults.set([]);
    this.clientSearch.set(c.name);
  }

  // ── Al cambiar servicio → autocompletar precio ─────────────────────────
  onServiceChange(serviceId: string): void {
    const svc = this.services().find(s => s.id === serviceId);
    if (svc) this.form.price_charged = svc.price;
    this.loadSlots();
  }

  onEmployeeChange(): void {
    this.loadSlots();
  }

  onDateChange(): void {
    this.loadSlots();
  }

  private loadSlots(): void {
    const { employee_id, service_id, date } = this.form;
    if (!employee_id || !service_id || !date) return;

    this.loadingSlots.set(true);
    this.slots.set([]);
    this.apptSvc.availability(employee_id, service_id, date).subscribe({
      next: r => {
        this.loadingSlots.set(false);
        // API returns array of "HH:MM" strings (already filtered to available only)
        this.slots.set(r?.data?.slots ?? []);
      },
      error: () => this.loadingSlots.set(false),
    });
  }

  // ── Submit crear cita ──────────────────────────────────────────────────
  onSubmit(): void {
    const { client_id, employee_id, service_id, date, start_time, price_charged } = this.form;
    if (!client_id || !employee_id || !service_id || !date || !start_time) {
      this.error.set('Completa todos los campos requeridos.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const payload: CreateAppointmentPayload = {
      client_id, employee_id, service_id, date, start_time,
      price_charged: Number(price_charged),
      notes: this.form.notes || undefined,
    };

    this.apptSvc.create(payload).subscribe({
      next: r => {
        this.loading.set(false);
        this.saved.emit(r.data);
      },
      error: err => {
        this.loading.set(false);
        const msg = err?.error?.message ?? err?.error?.error?.message ?? 'Error al crear la cita.';
        this.error.set(msg);
      },
    });
  }

  // ── Acciones de estado ─────────────────────────────────────────────────
  doConfirm(): void {
    if (!this.appointment) return;
    this.actionLoading.set('confirm');
    this.apptSvc.confirm(this.appointment.id).subscribe({
      next: r => { this.actionLoading.set(null); this.statusChanged.emit(r.data); },
      error: () => this.actionLoading.set(null),
    });
  }

  doComplete(): void {
    if (!this.appointment) return;
    this.actionLoading.set('complete');
    this.apptSvc.complete(this.appointment.id, {
      payment_status: this.completePayStatus,
      payment_method: this.completePayMethod || undefined,
    }).subscribe({
      next: r => {
        this.actionLoading.set(null);
        this.showCompleteForm.set(false);
        this.statusChanged.emit(r.data);
      },
      error: err => {
        this.actionLoading.set(null);
        const msg = err?.error?.message ?? err?.error?.error?.message ?? 'Error al completar.';
        this.error.set(msg);
      },
    });
  }

  openCompleteForm(): void {
    this.completePayStatus = 'paid';
    this.completePayMethod = 'cash';
    this.showCompleteForm.set(true);
    this.showCancelForm.set(false);
  }

  openCancelForm(): void {
    this.cancelReason = '';
    this.showCancelForm.set(true);
    this.showCompleteForm.set(false);
  }

  doCancel(): void {
    if (!this.appointment) return;
    this.actionLoading.set('cancel');
    this.apptSvc.cancel(this.appointment.id, this.cancelReason || 'Cancelado').subscribe({
      next: r => {
        this.actionLoading.set(null);
        this.showCancelForm.set(false);
        this.statusChanged.emit(r.data);
      },
      error: () => this.actionLoading.set(null),
    });
  }

  doNoShow(): void {
    if (!this.appointment) return;
    this.actionLoading.set('noshow');
    this.apptSvc.noShow(this.appointment.id).subscribe({
      next: r => { this.actionLoading.set(null); this.statusChanged.emit(r.data); },
      error: () => this.actionLoading.set(null),
    });
  }

  // ── Voucher upload / delete ────────────────────────────────────────────
  onVoucherSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file || !this.appointment) return;

    // preview local inmediato
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      this.voucherPreview.set(url);
    }

    this.voucherLoading.set(true);
    this.apptSvc.uploadVoucher(this.appointment.id, file).subscribe({
      next: r => {
        this.voucherLoading.set(false);
        // patch appointment sin recargar todo
        if (this.appointment) {
          const updated = { ...this.appointment, voucher_url: r.voucher_url };
          this.statusChanged.emit(updated as Appointment);
        }
      },
      error: err => {
        this.voucherLoading.set(false);
        this.voucherPreview.set(null);
        const msg = err?.error?.message ?? 'Error al subir el comprobante.';
        this.error.set(msg);
      },
    });
    // reset input value so same file can be re-uploaded
    input.value = '';
  }

  doDeleteVoucher(): void {
    if (!this.appointment) return;
    this.voucherLoading.set(true);
    this.voucherPreview.set(null);
    this.apptSvc.deleteVoucher(this.appointment.id).subscribe({
      next: () => {
        this.voucherLoading.set(false);
        if (this.appointment) {
          const updated = { ...this.appointment, voucher_url: null };
          this.statusChanged.emit(updated as Appointment);
        }
      },
      error: () => this.voucherLoading.set(false),
    });
  }

  get effectiveVoucherUrl(): string | null {
    return this.voucherPreview() ?? this.appointment?.voucher_url ?? null;
  }

  isPdf(url: string | null): boolean {
    return !!url && (url.endsWith('.pdf') || url.includes('/pdf'));
  }

  close(): void {
    this.closed.emit();
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  formatTime(t: string): string {
    return t?.slice(0, 5) ?? '';
  }

  formatDate(d: string): string {
    if (!d) return '';
    return new Date(d + 'T12:00:00').toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  employeeColor(empId: string): string {
    return this.employees().find(e => e.id === empId)?.color ?? '#C9A84C';
  }
}
