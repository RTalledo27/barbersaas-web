import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface BookingTenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  currency: string;
  timezone: string;
}

export interface BookingService {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  buffer_minutes: number | null;
  category: string | null;
}

export interface BookingEmployee {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
}

export interface DayAvailability {
  date: string;
  available: boolean;
  slots_count: number;
}

export interface TimeSlot {
  start: string;
  available: boolean;
}

export interface BookingPayload {
  service_ids: string[];
  employee_id: string;
  date: string;
  start_time: string;
  client_name: string;
  client_phone: string;
  client_email?: string;
  client_notes?: string;
}

export interface BookingResult {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  services: { id: string; name: string; price: number; duration_minutes: number }[];
  total_price: number;
  total_duration: number;
  employee: { name: string };
  client: { name: string; phone: string };
}

@Injectable({ providedIn: 'root' })
export class PublicBookingService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/public`;

  getTenant(slug: string): Observable<BookingTenant> {
    return this.http.get<any>(`${this.base}/${slug}`)
      .pipe(map(r => r.data));
  }

  getServices(slug: string): Observable<BookingService[]> {
    return this.http.get<any>(`${this.base}/${slug}/services`)
      .pipe(map(r => r.data));
  }

  getEmployees(slug: string, serviceIds: string[]): Observable<BookingEmployee[]> {
    return this.http.get<any>(`${this.base}/${slug}/employees`, {
      params: { 'service_ids[]': serviceIds }
    }).pipe(map(r => r.data));
  }

  getAvailabilityRange(slug: string, employeeId: string, serviceIds: string[], from: string, to: string): Observable<DayAvailability[]> {
    return this.http.get<any>(`${this.base}/${slug}/availability/range`, {
      params: { employee_id: employeeId, 'service_ids[]': serviceIds, from, to }
    }).pipe(map(r => r.data));
  }

  getSlots(slug: string, employeeId: string, serviceIds: string[], date: string): Observable<TimeSlot[]> {
    return this.http.get<any>(`${this.base}/${slug}/availability`, {
      params: { employee_id: employeeId, 'service_ids[]': serviceIds, date }
    }).pipe(map(r => r.data.slots));
  }

  book(slug: string, payload: BookingPayload): Observable<BookingResult> {
    return this.http.post<any>(`${this.base}/${slug}/appointments`, payload)
      .pipe(map(r => r.data));
  }
}
