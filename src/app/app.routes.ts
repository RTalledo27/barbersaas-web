import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./core/layout/shells/auth-shell/auth-shell')
      .then(m => m.AuthShellComponent),
    loadChildren: () => import('./core/layout/shells/auth-shell/auth-shell.routes')
      .then(m => m.routes)
  },

  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full'
  },

  { path: '**', redirectTo: 'auth/login' }
];
