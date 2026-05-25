import { Component, signal, computed, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth/auth.service';

function slugify(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class RegisterComponent {
  private fb     = inject(FormBuilder);
  private auth   = inject(AuthService);
  private router = inject(Router);

  loading     = signal(false);
  error       = signal<string | null>(null);
  fieldErrors = signal<Record<string, string>>({});
  success     = signal(false);
  showPassword = signal(false);

  form: FormGroup = this.fb.group({
    tenant_name:           ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    name:                  ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    email:                 ['', [Validators.required, Validators.email, Validators.maxLength(180)]],
    phone:                 [''],
    password:              ['', [Validators.required, Validators.minLength(8)]],
    password_confirmation: ['', Validators.required],
    terms:                 [false, Validators.requiredTrue],
  });

  // toSignal convierte el observable de valueChanges a una señal reactiva
  // para que computed() pueda rastrear los cambios del campo
  private tenantNameValue = toSignal(
    this.form.get('tenant_name')!.valueChanges,
    { initialValue: '' }
  );

  slugPreview = computed(() => slugify(this.tenantNameValue() ?? ''));

  get passwordStrength(): number {
    const pwd = this.form.get('password')?.value ?? '';
    let score = 0;
    if (pwd.length >= 8)           score++;
    if (/[A-Z]/.test(pwd))        score++;
    if (/[0-9]/.test(pwd))        score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  }

  get strengthLabel(): string {
    return ['', 'Débil', 'Regular', 'Buena', 'Fuerte'][this.passwordStrength] ?? '';
  }

  isInvalid(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && c?.touched);
  }

  hasFieldError(field: string): boolean {
    return !!this.fieldErrors()[field];
  }

  getFieldError(field: string): string {
    return this.fieldErrors()[field] ?? '';
  }

  get passwordMismatch(): boolean {
    const pwd     = this.form.get('password')?.value;
    const confirm = this.form.get('password_confirmation');
    return !!(confirm?.touched && pwd !== confirm?.value);
  }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.form.invalid || this.passwordMismatch) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.fieldErrors.set({});

    const payload = {
      tenant_name:           this.form.value.tenant_name,
      tenant_slug:           this.slugPreview(),
      name:                  this.form.value.name,
      email:                 this.form.value.email,
      phone:                 this.form.value.phone || null,
      password:              this.form.value.password,
      password_confirmation: this.form.value.password_confirmation,
      country_code:          'PE',
      timezone:              'America/Lima',
      currency:              'PEN',
    };

    this.auth.register(payload).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(true);
        setTimeout(() => this.router.navigate(['/app/dashboard']), 1500);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 422) {
          const errors = err.error?.errors as Record<string, string[]> | undefined;
          if (errors) {
            const map: Record<string, string> = {};
            for (const [key, msgs] of Object.entries(errors)) {
              map[key] = Array.isArray(msgs) ? msgs[0] : String(msgs);
            }
            this.fieldErrors.set(map);
            const first = Object.values(errors)[0];
            this.error.set(Array.isArray(first) ? first[0] : 'Datos inválidos. Revisa el formulario.');
          } else {
            this.error.set(err.error?.message ?? 'Datos inválidos. Revisa el formulario.');
          }
        } else if (err.status === 429) {
          this.error.set('Demasiados intentos. Espera un momento antes de continuar.');
        } else {
          this.error.set('Error al registrar. Intenta de nuevo más tarde.');
        }
      },
    });
  }
}
