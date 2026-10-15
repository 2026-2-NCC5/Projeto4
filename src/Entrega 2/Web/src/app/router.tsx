import type { ComponentType } from 'react';
import { createBrowserRouter, Outlet } from 'react-router';
import { FullPageLoading, RedirectIfAuthenticated, RequireAuth, RequireRole } from '@/features/auth/guards';
import { AppShell } from '@/layouts/AppShell';
import type { Area } from '@/layouts/nav';
import type { UserRole } from '@/types/api';
import { adminRoutes } from './routes/admin';
import { asaAppointmentRoutes, studentAppointmentRoutes } from './routes/appointments';
import { asaRoutes } from './routes/asa';
import { adminInsightRoutes, asaInsightRoutes } from './routes/insights';
import { page } from './routes/lazy';
import { studentRoutes } from './routes/student';

function AreaRoot({ area, role }: { area: Area; role: UserRole }) {
  return (
    <RequireAuth>
      <RequireRole role={role}>
        <AppShell area={area}>
          <Outlet />
        </AppShell>
      </RequireRole>
    </RequireAuth>
  );
}

const publicPage = (loader: () => Promise<{ default: ComponentType }>) => page(loader, <FullPageLoading />);

export const routes = [
  { path: '/', element: publicPage(() => import('@/pages/public/LandingPage')) },
  { path: '/login', element: <RedirectIfAuthenticated>{publicPage(() => import('@/pages/auth/LoginPage'))}</RedirectIfAuthenticated> },
  { path: '/cadastro', element: <RedirectIfAuthenticated>{publicPage(() => import('@/pages/auth/RegisterPage'))}</RedirectIfAuthenticated> },
  { path: '/recuperar-senha', element: publicPage(() => import('@/pages/auth/RecoverPasswordPage')) },
  { path: '/aluno', element: <AreaRoot area="aluno" role="student" />, children: [...studentRoutes, ...studentAppointmentRoutes] },
  { path: '/asa', element: <AreaRoot area="asa" role="institutional_staff" />, children: [...asaRoutes, ...asaAppointmentRoutes, ...asaInsightRoutes] },
  { path: '/admin', element: <AreaRoot area="admin" role="technical_admin" />, children: [...adminRoutes, ...adminInsightRoutes] },
  { path: '*', element: publicPage(() => import('@/pages/public/NotFoundPage')) },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
