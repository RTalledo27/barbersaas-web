import { Routes } from '@angular/router';


export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('../../../../features/auth/login/login')
      .then(m => m.LoginComponent),
    title: 'Iniciar sesión — BarberOS'
  },
  {
    path: 'register',
    loadComponent: () => import('../../../../features/auth/register/register')
      .then(m => m.RegisterComponent),
    title: 'Registrar barbería — BarberOS'
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('../../../../features/auth/forgot-password/forgot-password')
      .then(m => m.ForgotPasswordComponent),
    title: 'Recuperar contraseña — BarberOS'
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  }
];
