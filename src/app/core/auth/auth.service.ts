import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { API_URL } from '../api/api.config';
import {
  ApiResponse,
  AuthSession,
  AuthUser,
  AuthTenant,
  LoginPayload,
  RegisterPayload,
} from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http   = inject(HttpClient);
  private router = inject(Router);

  private _session = signal<AuthSession | null>(this.loadSession());

  readonly currentUser     = computed(() => this._session()?.user   ?? null);
  readonly currentTenant   = computed(() => this._session()?.tenant ?? null);
  readonly isAuthenticated = computed(() => !!this._session()?.token);

  register(payload: RegisterPayload): Observable<ApiResponse<AuthSession>> {
    return this.http
      .post<ApiResponse<AuthSession>>(`${API_URL}/auth/register`, payload)
      .pipe(tap(res => { if (res.success) this.saveSession(res.data); }));
  }

  login(payload: LoginPayload): Observable<ApiResponse<AuthSession>> {
    return this.http
      .post<ApiResponse<AuthSession>>(`${API_URL}/auth/login`, payload)
      .pipe(tap(res => { if (res.success) this.saveSession(res.data); }));
  }

  logout(): Observable<ApiResponse<null>> {
    return this.http
      .post<ApiResponse<null>>(`${API_URL}/auth/logout`, {})
      .pipe(tap(() => this.clearSession()));
  }

  forgotPassword(email: string): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${API_URL}/auth/forgot-password`, { email });
  }

  getToken(): string | null {
    return this._session()?.token ?? null;
  }

  private saveSession(data: AuthSession): void {
    localStorage.setItem('auth_token',  data.token);
    localStorage.setItem('auth_user',   JSON.stringify(data.user));
    localStorage.setItem('auth_tenant', JSON.stringify(data.tenant));
    this._session.set(data);
  }

  clearSession(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_tenant');
    this._session.set(null);
    this.router.navigate(['/auth/login']);
  }

  private loadSession(): AuthSession | null {
    try {
      const token  = localStorage.getItem('auth_token');
      const user   = localStorage.getItem('auth_user');
      const tenant = localStorage.getItem('auth_tenant');
      if (!token || !user) return null;
      return {
        token,
        token_type: 'Bearer',
        expires_at: '',
        user:   JSON.parse(user)   as AuthUser,
        tenant: tenant ? JSON.parse(tenant) as AuthTenant : null,
      };
    } catch {
      return null;
    }
  }
}
