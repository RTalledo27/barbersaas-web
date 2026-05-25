import { Component, signal, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
})
export class ForgotPasswordComponent {
  private fb   = inject(FormBuilder);
  private auth = inject(AuthService);

  loading    = signal(false);
  error      = signal<string | null>(null);
  success    = signal(false);
  sentToEmail = signal('');

  form: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  get emailInvalid(): boolean {
    const c = this.form.get('email');
    return !!(c?.invalid && c?.touched);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const email = this.form.value.email;
    this.loading.set(true);
    this.error.set(null);

    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.loading.set(false);
        this.sentToEmail.set(email);
        this.success.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 429) {
          this.error.set('Demasiados intentos. Espera unos minutos antes de continuar.');
        } else {
          this.error.set('No se pudo enviar el correo. Intenta de nuevo.');
        }
      },
    });
  }
}
