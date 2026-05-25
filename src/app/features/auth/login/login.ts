import { Component, signal, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent {
  private fb     = inject(FormBuilder);
  private auth   = inject(AuthService);
  private router = inject(Router);

  loading      = signal(false);
  error        = signal<string | null>(null);
  showPassword = signal(false);

  form: FormGroup = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    remember: [false],
  });

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  get emailInvalid(): boolean {
    const c = this.form.get('email');
    return !!(c?.invalid && c?.touched);
  }

  get passwordInvalid(): boolean {
    const c = this.form.get('password');
    return !!(c?.invalid && c?.touched);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.auth.login({
      email:    this.form.value.email,
      password: this.form.value.password,
      remember: this.form.value.remember,
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/app/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 401 || err.status === 422) {
          this.error.set('Credenciales incorrectas.');
        } else if (err.status === 403) {
          const code = err.error?.error?.code;
          this.error.set(
            code === 'TENANT_SUSPENDED'
              ? 'Esta cuenta está suspendida. Contacta soporte.'
              : 'Tu cuenta está inactiva o suspendida.'
          );
        } else if (err.status === 429) {
          this.error.set('Demasiados intentos. Espera un momento antes de continuar.');
        } else {
          this.error.set('Error al iniciar sesión. Intenta de nuevo.');
        }
      },
    });
  }
}
