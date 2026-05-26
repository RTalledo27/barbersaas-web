import { Routes } from "@angular/router";

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('../../../../features/dashboard/dasboard/dasboard')
          .then(m => m.DasboardComponent),
        title: 'Dashboard — BarberOS'
      },

  ]