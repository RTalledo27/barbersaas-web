export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'employee' | 'super_admin';
  status: 'active' | 'inactive' | 'suspended';
  email_verified_at: string | null;
  last_login_at: string | null;
}

export interface AuthTenant {
  id: number;
  name: string;
  slug: string;
  email: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  country_code: string;
  timezone: string;
  currency: string;
  status: 'trial' | 'active' | 'suspended' | 'inactive';
  plan: string;
  trial_ends_at: string | null;
  onboarding_completed: boolean;
}

export interface AuthSession {
  token: string;
  token_type: string;
  expires_at: string;
  user: AuthUser;
  tenant: AuthTenant | null;
}

export interface RegisterPayload {
  tenant_name: string;
  tenant_slug: string;
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  phone?: string | null;
  country_code?: string;
  timezone?: string;
  currency?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
  tenant_slug?: string;
  remember?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
