import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Bell, ChevronsLeft, ChevronsRight, LogOut, Menu, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useGsapMotion } from '@/components/motion/useGsapMotion';
import { IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Avatar } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useMe, useSession } from '@/features/auth/session';
import { AnnouncementBanner, usePlatformInfo } from '@/features/platform/platform';
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
    <Tooltip.Provider delayDuration={300}>
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
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                      cn(
                        'group flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-body transition-[background,color,transform] duration-150 hover:translate-x-0.5',
                        collapsed && 'justify-center px-0',
                        isActive ? 'bg-action-soft text-action font-semibold shadow-sm' : 'text-slate hover:bg-snow hover:text-ink',
                      )
                    }
                  >
                    <item.icon size={20} aria-hidden className="shrink-0" />
                    <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
                      </NavLink>
                    </Tooltip.Trigger>
                    {collapsed ? <Tooltip.Portal><Tooltip.Content side="right" sideOffset={8} className="z-[70] rounded-md bg-fecap px-3 py-2 text-small font-medium text-white shadow-md">{item.label}<Tooltip.Arrow className="fill-fecap" /></Tooltip.Content></Tooltip.Portal> : null}
                  </Tooltip.Root>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
    </Tooltip.Provider>
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
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: notificationKeys.list, queryFn: () => notificationsApi.list(8), refetchInterval: 60_000 });
  const unread = query.data?.unreadCount ?? 0;

  const markAll = async () => {
    const data = await notificationsApi.markRead();
    queryClient.setQueryData(notificationKeys.list, data);
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild><IconButton label={unread > 0 ? `Notificações (${unread} não lidas)` : 'Notificações'} icon={Bell} badge={unread} /></Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} aria-label="Notificações recentes" className="z-[80] w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-line bg-white shadow-lg outline-none data-[state=open]:animate-[asa-dialog-in_140ms_ease-out]">
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
                    <Link to={href} className="block outline-none hover:bg-paper focus:bg-paper">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
          <Link to={`/${area}/notificacoes`} className="block border-t border-line px-4 py-2.5 text-center text-small font-semibold text-action outline-none hover:bg-paper focus:bg-paper">
            Ver todas
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function UserMenu({ area }: { area: Area }) {
  const me = useMe();
  const { logout } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="flex min-w-0 items-center gap-2 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-snow focus-visible:ring-2 focus-visible:ring-action sm:gap-3">
          <span className="hidden min-w-0 text-right md:block"><span className="block truncate text-small font-semibold leading-tight text-ink">{me.user.fullName}</span><span className="block text-caption text-mist">{me.roleLabel}{me.isDemo ? ' · demonstração' : ''}</span></span>
          <Avatar name={me.user.fullName} />
          <span className="sr-only">Abrir menu da conta</span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={8} className="z-[80] min-w-56 rounded-lg border border-line bg-white p-1.5 shadow-lg outline-none data-[state=open]:animate-[asa-dialog-in_140ms_ease-out]">
          <div className="border-b border-line px-3 py-2"><p className="text-small font-semibold text-ink">{me.user.fullName}</p><p className="text-caption text-mist">{me.roleLabel}{me.isDemo ? ' · conta de demonstração' : ''}</p></div>
          <DropdownMenu.Item asChild><Link to={`/${area}/conta`} className="block cursor-pointer rounded-md px-3 py-2 text-small text-slate outline-none hover:bg-snow focus:bg-snow">Minha conta</Link></DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item onSelect={(event) => { event.preventDefault(); setConfirmLogout(true); }} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-small font-semibold text-danger-text outline-none hover:bg-danger-soft focus:bg-danger-soft"><LogOut size={16} aria-hidden />Sair</DropdownMenu.Item>
        </DropdownMenu.Content></DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ConfirmDialog open={confirmLogout} title="Sair do ASA Conecta?" description="Sua sessão será encerrada neste dispositivo." confirmLabel="Sair" tone="danger" loading={busy} onClose={() => setConfirmLogout(false)} onConfirm={() => { setBusy(true); void logout().catch(() => toast.show('Não foi possível encerrar a sessão no servidor.', 'error')).finally(() => { setBusy(false); setConfirmLogout(false); }); }} />
    </>
  );
}

/** Estrutura das áreas autenticadas: barra lateral (recolhível), topo e conteúdo. */
export function AppShell({ area, children }: { area: Area; children?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const platform = usePlatformInfo();
  const location = useLocation();
  const contentRef = useRef<HTMLElement>(null);
  useGsapMotion(contentRef, location.pathname);
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

        <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/35 data-[state=open]:animate-[asa-overlay-in_150ms_ease-out] lg:hidden" />
            <DialogPrimitive.Content aria-label="Menu de navegação" className="fixed inset-y-0 left-0 z-50 flex w-[min(19rem,88vw)] flex-col border-r border-line bg-white shadow-lg outline-none data-[state=open]:animate-[asa-drawer-in_180ms_ease-out] lg:hidden">
              <DialogPrimitive.Title className="sr-only">Menu de navegação</DialogPrimitive.Title>
              <div className="flex items-center justify-between pr-2"><Brand area={area} collapsed={false} /><DialogPrimitive.Close asChild><IconButton label="Fechar menu" icon={X} /></DialogPrimitive.Close></div>
              <SidebarNav area={area} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <AnnouncementBanner info={platform.data} />
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6">
            <div className="flex items-center gap-2">
              <IconButton label="Abrir menu" icon={Menu} className="lg:hidden" onClick={() => setMobileOpen(true)} />
              <span className="hidden rounded-sm bg-snow px-2 py-1 text-caption font-semibold text-slate sm:inline-flex">{AREA_META[area].label}</span>
              {area === 'admin' ? <span className="hidden items-center gap-2 text-caption text-mist md:flex" aria-label="Localização"><span aria-hidden>Administração</span><span aria-hidden>/</span><span className="font-semibold text-ink">{NAVIGATION.admin.flatMap((section) => section.items).find((item) => item.to === location.pathname)?.label ?? 'Plataforma'}</span></span> : null}
            </div>
            <div className="flex items-center gap-1 sm:gap-3">
              <NotificationBell area={area} />
              <UserMenu area={area} />
            </div>
          </header>
          <main ref={contentRef} id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8 focus:outline-none">
            {area === 'admin' ? <div key={location.pathname} className="asa-page-in">{children ?? <Outlet />}</div> : children ?? <Outlet />}
          </main>
        </div>
      </div>
    </div>
  );
}
