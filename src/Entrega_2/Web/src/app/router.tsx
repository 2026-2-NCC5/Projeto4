import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { RouteScrollReset } from './RouteScrollReset';
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
    <>
    <RouteScrollReset />
    <RequireAuth>
      <RequireRole role={role}>
        <AppShell area={area}>
          <Outlet />
        </AppShell>
      </RequireRole>
    </RequireAuth>
    </>
  );
}

const publicPage = (loader: () => Promise<{ default: ComponentType }>) => <><RouteScrollReset />{page(loader, <FullPageLoading />)}</>;

export const routes = [
  { path: '/', element: publicPage(() => import('@/pages/public/LandingPage')) },
  { path: '/asa-conecta', element: <Navigate to="/" replace /> },
  { path: '/conheca-o-asa', element: publicPage(() => import('@/pages/public/InstitutionalPage')) },
  { path: '/cesta-de-servicos', element: publicPage(() => import('@/pages/public/InstitutionalPage')) },
  { path: '/carreira', element: publicPage(() => import('@/pages/public/InstitutionalPage')) },
  { path: '/empresas', element: publicPage(() => import('@/pages/public/InstitutionalPage')) },
  { path: '/equipe', element: publicPage(() => import('@/pages/public/InstitutionalPage')) },
  { path: '/atendimento', element: publicPage(() => import('@/pages/public/InstitutionalPage')) },
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
