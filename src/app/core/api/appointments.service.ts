import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from './api.config';

// ── Tipos ──────────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | 'pending' | 'confirmed' | 'in_progress'
  | 'completed' | 'cancelled' | 'no_show';

export interface AppointmentClient {
  id: string; name: string; phone: string; email: string | null;
}
export interface AppointmentEmployee {
  id: string; name: string; color: string; photo_url: string | null;
}
export interface AppointmentService {
  id: string; name: string; duration_minutes: number; price: number;
}

export interface Appointment {
  id:            string;
  date:          string;
  start_time:    string;
  end_time:      string;
  status:        AppointmentStatus;
  status_label:  string;
  price_charged: number | null;
  notes:         string | null;
  client_notes:  string | null;
  source:        string;
  payment_status: string | null;
  payment_method: string | null;
  voucher_url:    string | null;
  client:         AppointmentClient;
  employee:       AppointmentEmployee;
  service:        AppointmentService;
}

// El backend devuelve un array de strings "HH:MM" (solo los disponibles)
export type AvailableSlot = string;

export interface CreateAppointmentPayload {
  client_id:     string;
  employee_id:   string;
  service_id:    string;
  date:          string;
  start_time:    string;
  price_charged: number;
  notes?:        string;
  client_notes?: string;
}

// ── Service ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  private http = inject(HttpClient);

  today(): Observable<any> {
    return this.http.get(`${API_URL}/appointments/today`);
  }

  list(params: Record<string, any> = {}): Observable<any> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
    }
    return this.http.get(`${API_URL}/appointments`, { params: p });
  }

  get(id: string): Observable<any> {
    return this.http.get(`${API_URL}/appointments/${id}`);
  }

  create(payload: CreateAppointmentPayload): Observable<any> {
    return this.http.post(`${API_URL}/appointments`, payload);
  }

  update(id: string, payload: Partial<CreateAppointmentPayload>): Observable<any> {
    return this.http.put(`${API_URL}/appointments/${id}`, payload);
  }

  confirm(id: string): Observable<any> {
    return this.http.post(`${API_URL}/appointments/${id}/confirm`, {});
  }

  complete(id: string, data: { payment_status: string; payment_method?: string }): Observable<any> {
    return this.http.post(`${API_URL}/appointments/${id}/complete`, data);
  }

  cancel(id: string, reason: string): Observable<any> {
    return this.http.post(`${API_URL}/appointments/${id}/cancel`, { reason });
  }

  noShow(id: string): Observable<any> {
    return this.http.post(`${API_URL}/appointments/${id}/no-show`, {});
  }

  reschedule(id: string, data: { date: string; start_time: string }): Observable<any> {
    return this.http.post(`${API_URL}/appointments/${id}/reschedule`, data);
  }

  uploadVoucher(id: string, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('voucher', file);
    return this.http.post(`${API_URL}/appointments/${id}/voucher`, fd);
  }

  deleteVoucher(id: string): Observable<any> {
    return this.http.delete(`${API_URL}/appointments/${id}/voucher`);
  }

  availability(employeeId: string, serviceId: string, date: string): Observable<any> {
    return this.http.get(`${API_URL}/appointments/availability`, {
      params: { employee_id: employeeId, service_id: serviceId, date },
    });
  }
}
