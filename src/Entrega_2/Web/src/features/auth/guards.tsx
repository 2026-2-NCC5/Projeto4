import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { AccessDenied } from '@/components/feedback/States';
import { Spinner } from '@/components/ui/Button';
import type { Permission, UserRole } from '@/types/api';
import { usePlatformInfo } from '@/features/platform/platform';
import type { PlatformInfo } from '@/types/api';
import { homeFor, useSession } from './session';

export function FullPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <Spinner label="Verificando sua sessão" size={28} />
    </div>
  );
}

export function platformHasInstitutionalData(info: PlatformInfo | undefined): boolean {
  return info?.dataMode === 'institutional' && info.academicSource.provider === 'institutional';
}

/** Em builds de produção, nunca permite autenticação ou áreas privadas contra uma API demo/desconhecida. */
export function RequireInstitutionalData({ children, enforce = import.meta.env.PROD }: { children: ReactNode; enforce?: boolean }) {
  const platform = usePlatformInfo();
  if (!enforce) return <>{children}</>;
  if (platform.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4" role="status" aria-live="polite">
        <Spinner label="Confirmando a origem institucional dos dados" size={28} />
      </div>
    );
  }
  if (!platformHasInstitutionalData(platform.data)) {
    const demoMode = platform.data?.dataMode === 'demo' || platform.data?.academicSource.provider === 'demo';
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
        <section role="alert" className="w-full max-w-xl rounded-xl border border-line bg-white p-6 text-center shadow-sm sm:p-9">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-warning-soft text-warning-text" aria-hidden>!</div>
          <h1 className="mt-5 text-2xl font-bold text-fecap">Acesso institucional temporariamente indisponível</h1>
          <p className="mt-3 text-small leading-6 text-slate">
            {demoMode
              ? 'A API vinculada ao portal informa modo de demonstração. O ASA Conecta bloqueou o login e as áreas autenticadas para não apresentar dados fictícios como reais.'
              : 'Não foi possível confirmar que a API está usando uma fonte institucional. O login e as áreas autenticadas ficam bloqueados até a origem real ser confirmada.'}
          </p>
          <button type="button" onClick={() => void platform.refetch()} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-action px-5 py-2.5 text-small font-semibold text-white hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">
            Verificar novamente
          </button>
        </section>
      </main>
    );
  }
  return <>{children}</>;
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
