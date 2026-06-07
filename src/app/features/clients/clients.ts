import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ClientsApiService,
  ClientLight,
  ClientDetail,
  ClientNote,
  CreateClientPayload,
} from '../../core/api/clients-api.service';

type ViewMode = 'list' | 'detail';
type DrawerMode = 'create' | 'edit';
type DetailTab = 'history' | 'notes';

const SOURCE_LABELS: Record<string, string> = {
  manual:    'Manual',
  online:    'Online',
  referral:  'Referido',
  walk_in:   'Walk-in',
  instagram: 'Instagram',
};

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clients.html',
  styleUrl: './clients.css',
})
export class ClientsComponent implements OnInit {
  private api    = inject(ClientsApiService);
  private router = inject(Router);

  // ── Estado principal ──────────────────────────────────────────────
  loading  = signal(true);
  error    = signal<string | null>(null);
  clients  = signal<ClientLight[]>([]);
  meta     = signal({ current_page: 1, last_page: 1, total: 0, per_page: 20 });

  // ── Filtros ───────────────────────────────────────────────────────
  searchQuery = signal('');
  filterVip   = signal(false);
  filterInactive = signal(false);
  currentPage = signal(1);

  private searchTimer: any;

  // ── Detalle ───────────────────────────────────────────────────────
  selectedClient = signal<ClientDetail | null>(null);
  detailLoading  = signal(false);
  detailTab      = signal<DetailTab>('history');

  // ── Notas ─────────────────────────────────────────────────────────
  newNote       = signal('');
  savingNote    = signal(false);
  deletingNoteId = signal<string | null>(null);

  // ── Drawer (create / edit) ────────────────────────────────────────
  drawerOpen = signal(false);
  drawerMode = signal<DrawerMode>('create');
  editingId  = signal<string | null>(null);
  formError  = signal<string | null>(null);
  saving     = signal(false);

  form: CreateClientPayload = {
    name: '', email: '', phone: '', birthdate: '', source: 'manual',
  };

  // ── Delete confirm ────────────────────────────────────────────────
  deleteConfirmId   = signal<string | null>(null);
  deleteConfirmName = signal('');
  deleting          = signal(false);

  // ── Computed ──────────────────────────────────────────────────────
  hasMore = computed(() => this.meta().current_page < this.meta().last_page);

  // ── Lifecycle ─────────────────────────────────────────────────────
  ngOnInit(): void { this.load(); }

  load(page = 1): void {
    this.loading.set(true);
    this.currentPage.set(page);
    this.api.list({
      search:   this.searchQuery() || undefined,
      vip:      this.filterVip(),
      inactive: this.filterInactive(),
      per_page: 20,
      page,
    }).subscribe({
      next: r => {
        this.loading.set(false);
        this.clients.set(r?.data ?? []);
        this.meta.set(r?.meta ?? { current_page: 1, last_page: 1, total: 0, per_page: 20 });
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudieron cargar los clientes.');
      },
    });
  }

  onSearch(q: string): void {
    this.searchQuery.set(q);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(1), 300);
  }

  toggleFilter(type: 'vip' | 'inactive'): void {
    if (type === 'vip')      this.filterVip.set(!this.filterVip());
    if (type === 'inactive') this.filterInactive.set(!this.filterInactive());
    this.load(1);
  }

  // ── Navegar a perfil completo ─────────────────────────────────────
  goProfile(c: ClientLight): void {
    this.router.navigate(['/app/clients', c.id]);
  }

  // ── Detalle ───────────────────────────────────────────────────────
  openDetail(c: ClientLight): void {
    this.detailLoading.set(true);
    this.selectedClient.set(null);
    this.detailTab.set('history');
    this.api.get(c.id).subscribe({
      next: r => {
        this.detailLoading.set(false);
        this.selectedClient.set(r?.data ?? null);
      },
      error: () => this.detailLoading.set(false),
    });
  }

  closeDetail(): void { this.selectedClient.set(null); this.detailLoading.set(false); }

  // ── Notas ─────────────────────────────────────────────────────────
  submitNote(): void {
    const content = this.newNote().trim();
    const client  = this.selectedClient();
    if (!content || !client) return;

    this.savingNote.set(true);
    this.api.addNote(client.id, content).subscribe({
      next: r => {
        this.savingNote.set(false);
        this.newNote.set('');
        const note = r?.data as ClientNote;
        this.selectedClient.update(c => c ? {
          ...c,
          notes: [note, ...(c.notes ?? [])],
        } : c);
      },
      error: () => this.savingNote.set(false),
    });
  }

  removeNote(noteId: string): void {
    const client = this.selectedClient();
    if (!client) return;
    this.deletingNoteId.set(noteId);
    this.api.deleteNote(client.id, noteId).subscribe({
      next: () => {
        this.deletingNoteId.set(null);
        this.selectedClient.update(c => c ? {
          ...c,
          notes: (c.notes ?? []).filter(n => n.id !== noteId),
        } : c);
      },
      error: () => this.deletingNoteId.set(null),
    });
  }

  // ── Drawer ────────────────────────────────────────────────────────
  openCreate(): void {
    this.drawerMode.set('create');
    this.editingId.set(null);
    this.formError.set(null);
    this.form = { name: '', email: '', phone: '', birthdate: '', source: 'manual' };
    this.drawerOpen.set(true);
  }

  openEdit(c: ClientLight | ClientDetail): void {
    this.drawerMode.set('edit');
    this.editingId.set(c.id);
    this.formError.set(null);
    this.form = {
      name:      c.name,
      email:     c.email     ?? '',
      phone:     c.phone     ?? '',
      birthdate: c.birthdate ?? '',
      source:    c.source    ?? 'manual',
    };
    this.drawerOpen.set(true);
  }

  closeDrawer(): void { this.drawerOpen.set(false); }

  onSubmit(): void {
    if (!this.form.name.trim()) {
      this.formError.set('El nombre es obligatorio.');
      return;
    }
    this.saving.set(true);
    this.formError.set(null);

    const payload: any = {
      name:      this.form.name.trim(),
      email:     this.form.email?.trim()     || undefined,
      phone:     this.form.phone?.trim()     || undefined,
      birthdate: this.form.birthdate?.trim() || undefined,
      source:    this.form.source            || 'manual',
    };

    const req = this.drawerMode() === 'create'
      ? this.api.create(payload)
      : this.api.update(this.editingId()!, payload);

    req.subscribe({
      next: r => {
        this.saving.set(false);
        this.drawerOpen.set(false);
        this.load(1);
        // if editing current detail, refresh it
        if (this.drawerMode() === 'edit' && this.selectedClient()?.id === this.editingId()) {
          this.openDetail(r?.data);
        }
      },
      error: err => {
        this.saving.set(false);
        const errors = err?.error?.errors;
        const msg = errors
          ? Object.values(errors as Record<string, string[]>).flat().join(' ')
          : (err?.error?.message ?? 'Error al guardar.');
        this.formError.set(msg);
      },
    });
  }

  // ── Delete ────────────────────────────────────────────────────────
  askDelete(c: ClientLight | ClientDetail): void {
    this.deleteConfirmId.set(c.id);
    this.deleteConfirmName.set(c.name);
  }

  confirmDelete(): void {
    const id = this.deleteConfirmId();
    if (!id) return;
    this.deleting.set(true);
    this.api.delete(id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteConfirmId.set(null);
        if (this.selectedClient()?.id === id) this.closeDetail();
        this.load(1);
      },
      error: err => {
        this.deleting.set(false);
        this.deleteConfirmId.set(null);
        alert(err?.error?.error?.message ?? 'No se pudo eliminar el cliente.');
      },
    });
  }

  cancelDelete(): void { this.deleteConfirmId.set(null); }

  // ── Pagination ────────────────────────────────────────────────────
  prevPage(): void { if (this.currentPage() > 1) this.load(this.currentPage() - 1); }
  nextPage(): void { if (this.hasMore()) this.load(this.currentPage() + 1); }

  // ── Helpers ───────────────────────────────────────────────────────
  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  sourceLabel(s: string): string {
    return SOURCE_LABELS[s] ?? s;
  }

  statusColor(s: string): string {
    const m: Record<string, string> = {
      pending:     '#D97706',
      confirmed:   '#3B82F6',
      in_progress: '#8B5CF6',
      completed:   '#059669',
      cancelled:   '#DC2626',
      no_show:     '#6B7280',
    };
    return m[s] ?? '#6B7280';
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  timeAgo(days: number | null): string {
    if (days === null) return 'Nunca visitó';
    if (days === 0)    return 'Hoy';
    if (days === 1)    return 'Ayer';
    if (days < 7)      return `Hace ${days} días`;
    if (days < 30)     return `Hace ${Math.floor(days/7)} sem.`;
    if (days < 365)    return `Hace ${Math.floor(days/30)} mes.`;
    return `Hace ${Math.floor(days/365)} año${Math.floor(days/365) > 1 ? 's' : ''}`;
  }

  noteDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
