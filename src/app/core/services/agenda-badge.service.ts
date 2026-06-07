import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../api/api.config';

@Injectable({ providedIn: 'root' })
export class AgendaBadgeService {
  private http = inject(HttpClient);

  /** Citas pendientes + confirmadas para hoy */
  todayActive = signal<number | null>(null);

  refresh(): void {
    const today = new Date().toISOString().split('T')[0];
    this.http.get<any>(`${API_URL}/appointments`, {
      params: { date: today, per_page: '1' },
    }).subscribe({
      next: r => {
        const meta = r?.meta;
        if (meta) {
          const active = (meta.pending ?? 0) + (meta.confirmed ?? 0);
          this.todayActive.set(active);
        }
      },
      error: () => this.todayActive.set(null),
    });
  }
}
