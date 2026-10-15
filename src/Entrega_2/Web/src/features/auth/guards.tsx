import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { AccessDenied } from '@/components/feedback/States';
import { Spinner } from '@/components/ui/Button';
import type { Permission, UserRole } from '@/types/api';
import { homeFor, useSession } from './session';

export function FullPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <Spinner label="Verificando sua sessão" size={28} />
    </div>
  );
}

/** Exige sessão; sem ela vai para o login lembrando a página pedida (?next=). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <FullPageLoading />;
  if (status === 'anonymous') {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

/**
 * Área por papel. É só experiência de uso: a API recusa (403) qualquer chamada fora da permissão.
 * Quem entra na área errada vê "acesso não permitido" com o link da própria área.
 */
export function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { me } = useSession();
  if (!me) return <FullPageLoading />;
  if (me.user.role !== role) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <AccessDenied description={<>Esta área é de outro perfil. Sua área é <a className="font-semibold text-action underline" href={homeFor(me.user.role)}>{homeFor(me.user.role)}</a>.</>} />
      </div>
    );
  }
  return <>{children}</>;
}

export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useSession();
  if (!can(permission)) return <AccessDenied />;
  return <>{children}</>;
}

/** Página pública que não faz sentido com sessão (login): manda para a área do papel. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status, me } = useSession();
  const location = useLocation();
  if (status === 'loading') return <FullPageLoading />;
  if (status === 'authenticated' && me) {
    const next = new URLSearchParams(location.search).get('next');
    // só caminhos internos da própria área (evita redirecionamento aberto)
    const safeNext = next && next.startsWith(homeFor(me.user.role)) && !next.startsWith('//') ? next : null;
    return <Navigate to={safeNext ?? homeFor(me.user.role)} replace />;
  }
  return <>{children}</>;
}
