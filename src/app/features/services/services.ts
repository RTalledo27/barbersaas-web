import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServicesApiService, ServiceCatalog } from '../../core/api/services-api.service';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../../core/api/api.config';

type ModalMode = 'create' | 'edit';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './services.html',
  styleUrl: './services.css',
})
export class ServicesComponent implements OnInit {
  private svcApi = inject(ServicesApiService);
  private http   = inject(HttpClient);

  // ── Estado ────────────────────────────────────────────
  loading    = signal(true);
  error      = signal<string | null>(null);
  saving     = signal(false);
  deleting   = signal<string | null>(null);

  services   = signal<ServiceCatalog[]>([]);
  categories = signal<string[]>([]);

  // ── Filtros ───────────────────────────────────────────
  filterCat    = signal('all');
  filterActive = signal<'all' | 'active' | 'inactive'>('active');
  searchQuery  = signal('');

  // ── Modal ─────────────────────────────────────────────
  modalOpen = signal(false);
  modalMode = signal<ModalMode>('create');
  editingId = signal<string | null>(null);
  formError = signal<string | null>(null);

  form = {
    name:             '',
    description:      '',
    duration_minutes: 30,
    buffer_minutes:   0,
    price:            0,
    category:         '',
    is_active:        true,
  };

  // ── Delete confirm ────────────────────────────────────
  deleteConfirmId   = signal<string | null>(null);
  deleteConfirmName = signal('');

  // ── Computed ──────────────────────────────────────────
  filtered = computed(() => {
    let list = this.services();
    const q    = this.searchQuery().toLowerCase().trim();
    const cat  = this.filterCat();
    const act  = this.filterActive();

    if (q)            list = list.filter(s => s.name.toLowerCase().includes(q) || (s.category ?? '').toLowerCase().includes(q));
    if (cat !== 'all') list = list.filter(s => s.category === cat);
    if (act === 'active')   list = list.filter(s => s.is_active);
    if (act === 'inactive') list = list.filter(s => !s.is_active);
    return list;
  });

  totalActive   = computed(() => this.services().filter(s => s.is_active).length);
  totalInactive = computed(() => this.services().filter(s => !s.is_active).length);
  avgPrice      = computed(() => {
    const active = this.services().filter(s => s.is_active);
    if (!active.length) return 0;
    return active.reduce((sum, s) => sum + s.price, 0) / active.length;
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.svcApi.list(false).subscribe({
      next: r => {
        this.loading.set(false);
        this.services.set(r?.data ?? []);
        const cats = [...new Set((r?.data ?? []).map((s: ServiceCatalog) => s.category).filter(Boolean))] as string[];
        this.categories.set(cats);
      },
      error: () => { this.loading.set(false); this.error.set('No se pudieron cargar los servicios.'); },
    });
  }

  // ── Modal ─────────────────────────────────────────────
  openCreate(): void {
    this.modalMode.set('create');
    this.editingId.set(null);
    this.formError.set(null);
    this.form = { name: '', description: '', duration_minutes: 30, buffer_minutes: 0, price: 0, category: '', is_active: true };
    this.modalOpen.set(true);
  }

  openEdit(s: ServiceCatalog): void {
    this.modalMode.set('edit');
    this.editingId.set(s.id);
    this.formError.set(null);
    this.form = {
      name:             s.name,
      description:      (s as any).description ?? '',
      duration_minutes: s.duration_minutes,
      buffer_minutes:   (s as any).buffer_minutes ?? 0,
      price:            s.price,
      category:         s.category ?? '',
      is_active:        s.is_active,
    };
    this.modalOpen.set(true);
  }

  closeModal(): void { this.modalOpen.set(false); }

  onSubmit(): void {
    if (!this.form.name.trim() || !this.form.duration_minutes || this.form.price < 0) {
      this.formError.set('Nombre, duración y precio son obligatorios.');
      return;
    }
    this.saving.set(true);
    this.formError.set(null);

    const payload = {
      name:             this.form.name.trim(),
      description:      this.form.description.trim() || undefined,
      duration_minutes: Number(this.form.duration_minutes),
      buffer_minutes:   Number(this.form.buffer_minutes) || 0,
      price:            Number(this.form.price),
      category:         this.form.category.trim() || undefined,
      is_active:        this.form.is_active,
    };

    const req = this.modalMode() === 'create'
      ? this.http.post(`${API_URL}/services`, payload)
      : this.http.put(`${API_URL}/services/${this.editingId()}`, payload);

    req.subscribe({
      next: () => { this.saving.set(false); this.modalOpen.set(false); this.load(); },
      error: err => {
        this.saving.set(false);
        const msg = err?.error?.message ?? 'Error al guardar el servicio.';
        this.formError.set(msg);
      },
    });
  }

  // ── Eliminar ──────────────────────────────────────────
  askDelete(s: ServiceCatalog): void {
    this.deleteConfirmId.set(s.id);
    this.deleteConfirmName.set(s.name);
  }

  confirmDelete(): void {
    const id = this.deleteConfirmId();
    if (!id) return;
    this.deleting.set(id);
    this.http.delete(`${API_URL}/services/${id}`).subscribe({
      next: () => {
        this.deleting.set(null);
        this.deleteConfirmId.set(null);
        this.load();
      },
      error: err => {
        this.deleting.set(null);
        this.deleteConfirmId.set(null);
        alert(err?.error?.error?.message ?? 'No se pudo eliminar el servicio.');
      },
    });
  }

  cancelDelete(): void { this.deleteConfirmId.set(null); }

  // ── Toggle activo ──────────────────────────────────────
  toggleActive(s: ServiceCatalog): void {
    this.http.put(`${API_URL}/services/${s.id}`, { is_active: !s.is_active }).subscribe({
      next: () => this.load(),
    });
  }

  // ── Helpers ───────────────────────────────────────────
  durationLabel(min: number): string {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m}min` : `${h}h`;
  }

  categoryColor(cat: string | null): string {
    if (!cat) return '#5A5A5A';
    const colors = ['#C9A84C','#3B82F6','#8B5CF6','#059669','#D97706','#EC4899'];
    let hash = 0;
    for (const c of cat) hash = (hash * 31 + c.charCodeAt(0)) & 0xfffffff;
    return colors[Math.abs(hash) % colors.length];
  }
}
