import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from './api.config';

// ── Interfaces ────────────────────────────────────────────────────────────

export interface FinanceSummary {
  period: { from: string; to: string };
  summary: {
    total_income:      number;
    total_expenses:    number;
    total_commissions: number;
    net_profit:        number;
  };
  by_payment_method: { method: string; total: number; count: number }[];
  by_employee:       { employee_id: string; employee_name: string; photo_url: string | null; total: number; count: number }[];
  by_service:        { service_id: string; service_name: string; total: number; count: number }[];
}

export interface DailyPoint {
  date:  string;
  total: number;
  count: number;
}

export interface IncomeRecord {
  id:                string;
  gross_amount:      number;
  commission_amount: number;
  net_amount:        number;
  payment_method:    string;
  payment_status:    string | null;
  date:              string;
  notes:             string | null;
  voucher_url:       string | null;
  appointment_id:    string | null;
  employee:    { id: string; name: string; color: string } | null;
  service:     { id: string; name: string } | null;
  appointment: {
    id:             string;
    date:           string;
    start_time:     string;
    payment_status: string | null;
    voucher_url:    string | null;
    client:         { id: string; name: string; phone: string } | null;
  } | null;
  created_at: string;
}

export interface CashierStats {
  total_count:  number;
  total_income: number;
  avg_ticket:   number;
  pending:      number;
  with_voucher: number;
  by_method:    { cash: number; card: number; transfer: number; yape: number; plin: number };
}

export interface Expense {
  id:          string;
  category:    string;
  description: string;
  amount:      number;
  date:        string;
  receipt_url: string | null;
  created_by:  { id: string; name: string } | null;
  created_at:  string;
}

export interface Commission {
  employee_id:   string;
  employee_name: string;
  photo_url:     string | null;
  pending_total: number;
  records:       { appointment_id: string; date: string; total: number }[];
}

export interface Payout {
  id:         string;
  amount:     number;
  paid_at:    string;
  notes:      string | null;
  employee:   { id: string; name: string } | null;
  created_at: string;
}

export interface PageMeta {
  current_page: number;
  last_page:    number;
  per_page:     number;
  total:        number;
}

export interface PeakDay {
  day_index: number;
  day_name:  string;
  count:     number;
  total:     number;
}

export interface PeakHour {
  hour:  number;
  label: string;
  count: number;
  total: number;
}

export interface PeakAnalysis {
  by_day:              PeakDay[];
  by_hour:             PeakHour[];
  avg_ticket:          number;
  total_appointments:  number;
}

export interface ComparisonSummary {
  total_income:      number;
  total_expenses:    number;
  total_commissions: number;
  net_profit:        number;
}

export interface Comparison {
  current:          ComparisonSummary;
  previous:         ComparisonSummary;
  previous_period:  { from: string; to: string };
  changes: {
    total_income:      number;
    total_expenses:    number;
    total_commissions: number;
    net_profit:        number;
  };
}

export interface CreateExpensePayload {
  category:    string;
  description: string;
  amount:      number;
  date:        string;
}

// ── Service ───────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class FinanceApiService {
  private http = inject(HttpClient);
  private base = `${API_URL}/finance`;

  summary(from: string, to: string): Observable<{ success: boolean; data: FinanceSummary }> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<any>(`${this.base}/summary`, { params });
  }

  daily(from: string, to: string): Observable<{ success: boolean; data: DailyPoint[] }> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<any>(`${this.base}/daily`, { params });
  }

  cashierStats(from: string, to: string): Observable<{ success: boolean; data: CashierStats }> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<any>(`${this.base}/cashier-stats`, { params });
  }

  income(params: {
    from?: string; to?: string;
    employee_id?: string;
    payment_method?: string;
    has_voucher?: '0' | '1';
    page?: number; per_page?: number;
  }): Observable<{ success: boolean; data: IncomeRecord[]; meta: PageMeta }> {
    let p = new HttpParams();
    if (params.from)           p = p.set('from', params.from);
    if (params.to)             p = p.set('to', params.to);
    if (params.employee_id)    p = p.set('employee_id', params.employee_id);
    if (params.payment_method) p = p.set('payment_method', params.payment_method);
    if (params.has_voucher != null) p = p.set('has_voucher', params.has_voucher);
    if (params.page)           p = p.set('page', params.page);
    if (params.per_page)       p = p.set('per_page', params.per_page);
    return this.http.get<any>(`${this.base}/income`, { params: p });
  }

  expenses(params: { from?: string; to?: string; category?: string; page?: number; per_page?: number }):
    Observable<{ success: boolean; data: Expense[]; meta: PageMeta }> {
    let p = new HttpParams();
    if (params.from)     p = p.set('from', params.from);
    if (params.to)       p = p.set('to', params.to);
    if (params.category) p = p.set('category', params.category);
    if (params.page)     p = p.set('page', params.page);
    if (params.per_page) p = p.set('per_page', params.per_page);
    return this.http.get<any>(`${this.base}/expenses`, { params: p });
  }

  createExpense(payload: CreateExpensePayload): Observable<{ success: boolean; data: Expense }> {
    return this.http.post<any>(`${this.base}/expenses`, payload);
  }

  deleteExpense(id: string): Observable<{ success: boolean }> {
    return this.http.delete<any>(`${this.base}/expenses/${id}`);
  }

  dailyExpenses(from: string, to: string): Observable<{ success: boolean; data: DailyPoint[] }> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<any>(`${this.base}/daily-expenses`, { params });
  }

  peakAnalysis(from: string, to: string): Observable<{ success: boolean; data: PeakAnalysis }> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<any>(`${this.base}/peak-analysis`, { params });
  }

  comparison(from: string, to: string): Observable<{ success: boolean; data: Comparison }> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<any>(`${this.base}/comparison`, { params });
  }

  commissions(): Observable<{ success: boolean; data: Commission[] }> {
    return this.http.get<any>(`${this.base}/commissions`);
  }

  payCommissions(employeeId: string): Observable<{ success: boolean; data: Payout }> {
    return this.http.post<any>(`${this.base}/commissions/${employeeId}/pay`, {});
  }

  payouts(params: { employee_id?: string; from?: string; to?: string; page?: number; per_page?: number }):
    Observable<{ success: boolean; data: Payout[]; meta: PageMeta }> {
    let p = new HttpParams();
    if (params.employee_id) p = p.set('employee_id', params.employee_id);
    if (params.from)        p = p.set('from', params.from);
    if (params.to)          p = p.set('to', params.to);
    if (params.page)        p = p.set('page', params.page);
    if (params.per_page)    p = p.set('per_page', params.per_page);
    return this.http.get<any>(`${this.base}/payouts`, { params: p });
  }
}
