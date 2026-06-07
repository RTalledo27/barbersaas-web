import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ClientsApiService, ClientDetail } from '../../../core/api/clients-api.service';
import { AppointmentsService } from '../../../core/api/appointments.service';

@Component({
  selector: 'app-client-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-profile.html',
  styleUrl: './client-profile.css',
})
export class ClientProfileComponent implements OnInit {
  private route      = inject(ActivatedRoute);
  private router     = inject(Router);
  private clientsSvc = inject(ClientsApiService);

  loading = signal(true);
  error   = signal<string | null>(null);
  client  = signal<ClientDetail | null>(null);

  // Notas
  noteText    = signal('');
  savingNote  = signal(false);

  // Tab activa
  activeTab = signal<'history' | 'notes'>('history');

  readonly STATUS_LABEL: Record<string, string> = {
    pending: 'Pendiente', confirmed: 'Confirmada',
    in_progress: 'En curso', completed: 'Completada',
    cancelled: 'Cancelada', no_show: 'No asistió',
  };

  readonly STATUS_COLOR: Record<string, string> = {
    pending: '#D97706', confirmed: '#3B82F6',
    in_progress: '#8B5CF6', completed: '#059669',
    cancelled: '#DC2626', no_show: '#6B7280',
  };

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/app/clients']); return; }
    this.load(id);
  }

  load(id: string): void {
    this.loading.set(true);
    this.clientsSvc.get(id).subscribe({
      next: r => {
        this.loading.set(false);
        this.client.set(r?.data ?? null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No se pudo cargar el cliente.');
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/app/clients']);
  }

  addNote(): void {
    const c = this.client();
    const text = this.noteText().trim();
    if (!c || !text) return;

    this.savingNote.set(true);
    this.clientsSvc.addNote(c.id, text).subscribe({
      next: () => {
        this.noteText.set('');
        this.savingNote.set(false);
        this.load(c.id); // refrescar
      },
      error: () => this.savingNote.set(false),
    });
  }

  deleteNote(noteId: string): void {
    const c = this.client();
    if (!c) return;
    this.clientsSvc.deleteNote(c.id, noteId).subscribe({
      next: () => this.load(c.id),
    });
  }

  initial(name: string): string {
    return (name ?? '?').charAt(0).toUpperCase();
  }

  formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d + 'T12:00:00').toLocaleDateString('es-PE', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  formatDateTime(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-PE', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  sinceLastVisit(): string {
    const days = this.client()?.days_since_last_visit;
    if (days === null || days === undefined) return 'Sin visitas';
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    return `Hace ${days} días`;
  }
}
