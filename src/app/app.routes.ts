import { Routes } from '@angular/router';

const isSubdomain = (): boolean => {
  const parts = window.location.hostname.split('.');
  return parts.length >= 3 && parts[0] !== 'www';
};

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./core/layout/shells/auth-shell/auth-shell')
      .then(m => m.AuthShellComponent),
    loadChildren: () => import('./core/layout/shells/auth-shell/auth-shell.routes')
      .then(m => m.routes)
  },
  {
    path: 'app',
    loadComponent: () => import('./core/layout/shells/app-shell/app-shell')
      .then(m => m.AppShellComponent),
    loadChildren: () => import('./core/layout/shells/app-shell/app-shell.routes')
      .then(m => m.routes)
  },


  // Dev local: localhost:4200/booking/prueba
  {
    path: 'booking/:slug',
    loadComponent: () => import('./features/booking/booking').then(m => m.BookingComponent),
    title: 'Reservar cita — BarberOS'
  },

  // Producción con subdominio: prueba.barberos.com (raíz)
  {
    path: '',
    canMatch: [() => isSubdomain()],
    loadComponent: () => import('./features/booking/booking').then(m => m.BookingComponent),
    title: 'Reservar cita — BarberOS'
  },

  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full'
  },

  { path: '**', redirectTo: 'auth/login' }
];
