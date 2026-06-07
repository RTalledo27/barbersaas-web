import { Routes } from "@angular/router";

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('../../../../features/dashboard/dasboard/dasboard')
      .then(m => m.DasboardComponent),
    title: 'Dashboard — BarberOS'
  },
  {
    path: 'appointments',
    loadComponent: () => import('../../../../features/appointments/appointments')
      .then(m => m.AppointmentsComponent),
    title: 'Agenda — BarberOS'
  },
  {
    path: 'services',
    loadComponent: () => import('../../../../features/services/services')
      .then(m => m.ServicesComponent),
    title: 'Servicios — BarberOS'
  },
  {
    path: 'team',
    loadComponent: () => import('../../../../features/team/team')
      .then(m => m.TeamComponent),
    title: 'Equipo — BarberOS'
  },
  {
    path: 'clients',
    loadComponent: () => import('../../../../features/clients/clients')
      .then(m => m.ClientsComponent),
    title: 'Clientes — BarberOS'
  },
  {
    path: 'payments',
    loadComponent: () => import('../../../../features/payments/payments')
      .then(m => m.PaymentsComponent),
    title: 'Caja — BarberOS'
  },
  {
    path: 'revenue',
    loadComponent: () => import('../../../../features/revenue/revenue')
      .then(m => m.RevenueComponent),
    title: 'Ingresos — BarberOS'
  },
  {
    path: 'analytics',
    loadComponent: () => import('../../../../features/analytics/analytics')
      .then(m => m.AnalyticsComponent),
    title: 'Estadísticas — BarberOS'
  },
]