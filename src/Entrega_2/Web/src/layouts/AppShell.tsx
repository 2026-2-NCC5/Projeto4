import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronsLeft, ChevronsRight, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { IconButton } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Display';
import { useMe, useSession } from '@/features/auth/session';
import { AnnouncementBanner, DataModeBanner, usePlatformInfo } from '@/features/platform/platform';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { notificationsApi } from '@/services/api/endpoints';
import { notificationHref } from '@/features/notifications/links';
import { AREA_META, NAVIGATION, type Area } from './nav';

const COLLAPSE_KEY = 'asa.web.sidebar.collapsed';

/** Preferência local (só conveniência visual): tolera armazenamento bloqueado. */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    // armazenamento indisponível (janela privada): segue sem lembrar
  }
}

export const notificationKeys = { list: ['notifications', 'list'] as const };

function SidebarNav({ area, collapsed, onNavigate }: { area: Area; collapsed: boolean; onNavigate?: () => void }) {
  const me = useMe();
  const platform = usePlatformInfo();
  const features = platform.data?.features;
  return (
    <nav aria-label={`Navegação — ${AREA_META[area].label}`} className="flex-1 overflow-y-auto px-2 py-3">
      {NAVIGATION[area].map((section, index) => {
        const items = section.items.filter(
          (item) => (!item.permission || me.permissions.includes(item.permission)) && (!item.feature || !features || features[item.feature]),
        );
        if (items.length === 0) return null;
        return (
          <div key={section.title ?? index} className="mb-3">
            {section.title && !collapsed ? <p className="px-3 pb-1 pt-2 text-caption font-semibold uppercase tracking-wide text-mist">{section.title}</p> : null}
            {section.title && collapsed ? <hr className="mx-3 my-2 border-line" /> : null}
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-body transition-colors',
                        collapsed && 'justify-center px-0',
                        isActive ? 'bg-action-soft text-action font-semibold' : 'text-slate hover:bg-snow hover:text-ink',
                      )
                    }
                  >
                    <item.icon size={20} aria-hidden className="shrink-0" />
                    <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ area, collapsed }: { area: Area; collapsed: boolean }) {
  return (
    <Link to={`/${area}`} className="flex items-center gap-3 px-4 py-4" aria-label={`ASA Conecta — ${AREA_META[area].label}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-action">
        <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-md" />
      </span>
      {!collapsed ? (
        <span className="min-w-0">
          <span className="block text-h4 font-bold text-ink leading-tight">ASA Conecta</span>
          <span className="block text-caption text-mist">{AREA_META[area].label}</span>
        </span>
      ) : null}
    </Link>
  );
}

function NotificationBell({ area }: { area: Area }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: notificationKeys.list, queryFn: () => notificationsApi.list(8), refetchInterval: 60_000 });
  const unread = query.data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAll = async () => {
    const data = await notificationsApi.markRead();
    queryClient.setQueryData(notificationKeys.list, data);
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <div className="relative" ref={panelRef}>
      <IconButton label={unread > 0 ? `Notificações (${unread} não lidas)` : 'Notificações'} icon={Bell} badge={unread} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)} />
      {open ? (
        <div role="dialog" aria-label="Notificações recentes" className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-line bg-white shadow-lg asa-appear">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-h4 font-semibold">Notificações</p>
            {unread > 0 ? (
              <button type="button" className="text-small font-semibold text-action hover:underline" onClick={() => void markAll()}>
                Marcar todas como lidas
              </button>
            ) : null}
          </div>
          <ul className="max-h-96 divide-y divide-line-soft overflow-y-auto">
            {query.isPending ? <li className="px-4 py-6 text-center text-small text-mist">Carregando…</li> : null}
            {query.data && query.data.items.length === 0 ? <li className="px-4 py-6 text-center text-small text-mist">Nenhuma notificação por aqui.</li> : null}
            {query.data?.items.map((item) => {
              const href = notificationHref(area, item);
              const body = (
                <div className="px-4 py-3">
                  <p className={cn('text-small text-ink', !item.readAt && 'font-semibold')}>{item.title}</p>
                  <p className="text-caption text-slate line-clamp-2">{item.body}</p>
                  <p className="mt-1 text-caption text-mist">{formatRelative(item.createdAt)}</p>
                </div>
              );
              return (
                <li key={item.id} className={cn(!item.readAt && 'bg-action-soft/40')}>
                  {href ? (
                    <Link to={href} onClick={() => setOpen(false)} className="block hover:bg-paper">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
          <Link to={`/${area}/notificacoes`} onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-small font-semibold text-action hover:bg-paper">
            Ver todas
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function UserMenu() {
  const me = useMe();
  const { logout } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right md:block">
        <p className="text-small font-semibold text-ink leading-tight">{me.user.fullName}</p>
        <p className="text-caption text-mist">{me.roleLabel}{me.isDemo ? ' · conta de demonstração' : ''}</p>
      </div>
      <Avatar name={me.user.fullName} />
      <IconButton
        label="Sair"
        icon={LogOut}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void logout().finally(() => setBusy(false));
        }}
      />
    </div>
  );
}

/** Estrutura das áreas autenticadas: barra lateral (recolhível), topo e conteúdo. */
export function AppShell({ area, children }: { area: Area; children?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const platform = usePlatformInfo();
  const location = useLocation();
  const [lastPath, setLastPath] = useState(location.pathname);
  // fecha o menu móvel ao trocar de página (ajuste durante a renderização, sem efeito)
  if (location.pathname !== lastPath) {
    setLastPath(location.pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  return (
    <div className="min-h-screen bg-paper">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow-md">
        Pular para o conteúdo
      </a>
      <div className="flex">
        <aside className={cn('sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-white lg:flex transition-[width] duration-200', collapsed ? 'w-[68px]' : 'w-64')}>
          <div className={cn('h-1 w-full', AREA_META[area].accent)} aria-hidden />
          <Brand area={area} collapsed={collapsed} />
          <SidebarNav area={area} collapsed={collapsed} />
          <button
            type="button"
            onClick={() => {
              setCollapsed((value) => {
                writeCollapsed(!value);
                return !value;
              });
            }}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="flex items-center gap-2 border-t border-line px-4 py-3 text-small text-slate hover:bg-snow hover:text-ink"
          >
            {collapsed ? <ChevronsRight size={18} aria-hidden className="mx-auto" /> : <ChevronsLeft size={18} aria-hidden />}
            {!collapsed ? 'Recolher menu' : null}
          </button>
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-ink/45" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col bg-white shadow-lg asa-appear">
              <div className="flex items-center justify-between pr-2">
                <Brand area={area} collapsed={false} />
                <IconButton label="Fechar menu" icon={X} onClick={() => setMobileOpen(false)} />
              </div>
              <SidebarNav area={area} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <DataModeBanner info={platform.data} />
          <AnnouncementBanner info={platform.data} />
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6">
            <div className="flex items-center gap-2">
              <IconButton label="Abrir menu" icon={Menu} className="lg:hidden" onClick={() => setMobileOpen(true)} />
              <span className="rounded-sm bg-snow px-2 py-1 text-caption font-semibold text-slate">{AREA_META[area].label}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-3">
              <NotificationBell area={area} />
              <UserMenu />
            </div>
          </header>
          <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8 focus:outline-none">
            {children ?? <Outlet />}
          </main>
        </div>
      </div>
    </div>
  );
}
