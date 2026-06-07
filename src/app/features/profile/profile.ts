import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { API_URL } from '../../core/api/api.config';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class ProfileComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  user = this.auth.currentUser;

  saving  = signal(false);
  success = signal<string | null>(null);
  error   = signal<string | null>(null);

  // Cambio de contraseña
  showPasswordForm = signal(false);
  savingPassword   = signal(false);
  passwordError    = signal<string | null>(null);
  passwordSuccess  = signal<string | null>(null);

  form = {
    name:       '',
    phone:      '',
    avatar_url: '',
  };

  passwordForm = {
    current_password:      '',
    password:              '',
    password_confirmation: '',
  };

  initial = computed(() =>
    (this.user()?.name?.charAt(0) ?? 'U').toUpperCase()
  );

  roleLabel = computed(() => {
    const map: Record<string, string> = {
      owner: 'Propietario', admin: 'Administrador',
      employee: 'Empleado', super_admin: 'Super Admin',
    };
    return map[this.user()?.role ?? ''] ?? '';
  });

  ngOnInit(): void {
    const u = this.user();
    if (u) {
      this.form.name       = u.name       ?? '';
      this.form.phone      = (u as any).phone      ?? '';
      this.form.avatar_url = (u as any).avatar_url ?? '';
    }
  }

  save(): void {
    this.saving.set(true);
    this.success.set(null);
    this.error.set(null);

    const payload: any = {};
    if (this.form.name)       payload.name       = this.form.name;
    if (this.form.phone)      payload.phone      = this.form.phone;
    if (this.form.avatar_url) payload.avatar_url = this.form.avatar_url;

    this.http.put<any>(`${API_URL}/auth/me`, payload).subscribe({
      next: r => {
        this.saving.set(false);
        this.success.set('Perfil actualizado correctamente.');
        setTimeout(() => this.success.set(null), 3000);
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Error al actualizar el perfil.');
      },
    });
  }

  savePassword(): void {
    if (this.passwordForm.password !== this.passwordForm.password_confirmation) {
      this.passwordError.set('Las contraseñas no coinciden.');
      return;
    }
    if (this.passwordForm.password.length < 8) {
      this.passwordError.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    this.savingPassword.set(true);
    this.passwordError.set(null);

    this.http.put<any>(`${API_URL}/auth/me`, {
      password:              this.passwordForm.password,
      password_confirmation: this.passwordForm.password_confirmation,
    }).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordSuccess.set('Contraseña actualizada.');
        this.passwordForm = { current_password: '', password: '', password_confirmation: '' };
        this.showPasswordForm.set(false);
        setTimeout(() => this.passwordSuccess.set(null), 3000);
      },
      error: err => {
        this.savingPassword.set(false);
        this.passwordError.set(err?.error?.message ?? 'Error al cambiar la contraseña.');
      },
    });
  }
}
