import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  // Solo adjuntar token a requests que van a nuestra propia API
  if (!req.url.startsWith(environment.apiUrl)) return next(req);

  const token = localStorage.getItem('auth_token');
  if (!token) return next(req);

  return next(req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  }));
};
