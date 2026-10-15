import { CircleAlert, Inbox, Lock, RefreshCw, WifiOff } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Display';
import { isApiError, messageForError } from '@/services/api/client';

type Icon = ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;

export function EmptyState({ title, description, icon: IconGlyph = Inbox, action }: { title: string; description?: ReactNode; icon?: Icon; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-white px-6 py-10 text-center">
      <IconGlyph size={24} className="text-mist" aria-hidden />
      <p className="text-h4 font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-md text-small text-slate">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Erro com causa legível e nova tentativa só quando faz sentido (rede, servidor). */
export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const offline = isApiError(error) && (error.kind === 'offline' || error.kind === 'network');
  const retryable = !isApiError(error) || ['offline', 'network', 'timeout', 'server', 'dependency', 'contract'].includes(error.kind);
  const requestId = isApiError(error) ? error.requestId : null;
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-line bg-white px-6 py-10 text-center">
      {offline ? <WifiOff size={24} className="text-warning" aria-hidden /> : <CircleAlert size={24} className="text-danger" aria-hidden />}
      <p className="text-h4 font-semibold">{title ?? (offline ? 'Sem conexão' : 'Não foi possível carregar')}</p>
      <p className="max-w-md text-small text-slate">{messageForError(error)}</p>
      {requestId ? <p className="text-caption text-mist">Código para o suporte: {requestId}</p> : null}
      {onRetry && retryable ? (
        <Button className="mt-2" icon={RefreshCw} onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function AccessDenied({ description }: { description?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-white px-6 py-12 text-center">
      <Lock size={24} className="text-mist" aria-hidden />
      <h1 className="text-h3 font-semibold">Acesso não permitido</h1>
      <p className="max-w-md text-small text-slate">{description ?? 'Seu perfil não tem permissão para esta área. Se precisar de acesso, fale com a administração do ASA Conecta.'}</p>
      <ButtonLink to="/" className="mt-2">
        Voltar ao início
      </ButtonLink>
    </div>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4">
      <span className="sr-only">Carregando</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * Aviso em linha quando a atualização em segundo plano falhou mas há dados já carregados: a tela continua
 * mostrando esses dados (marcados como possivelmente desatualizados) em vez de trocá-los por um erro.
 */
export function StaleDataNotice({ error, onRetry, retrying = false }: { error: unknown; onRetry?: () => void; retrying?: boolean }) {
  const retryable = !isApiError(error) || ['offline', 'network', 'timeout', 'server', 'dependency', 'contract'].includes(error.kind);
  return (
    <div role="alert" className="mb-3 flex flex-col gap-2 rounded-md border border-warning/40 bg-warning-soft px-4 py-3 text-small text-warning-text sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2">
        <CircleAlert size={18} className="mt-px shrink-0" aria-hidden />
        <span>
          <span className="font-semibold">Não foi possível atualizar agora.</span> Mostrando os últimos dados carregados. {messageForError(error)}
        </span>
      </p>
      {onRetry && retryable ? (
        <Button size="sm" icon={RefreshCw} loading={retrying} onClick={onRetry} className="shrink-0 self-start sm:self-auto">
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Renderiza os estados de uma consulta (carregando, erro, vazio, dados). Cada página trata os quatro
 * casos sem repetir a lógica. Erro só substitui a tela quando ainda não há dados; se uma atualização em
 * segundo plano falhar, os dados carregados continuam visíveis com um aviso em linha.
 */
export function QueryView<T>({
  query,
  loading,
  empty,
  isEmpty,
  children,
}: {
  query: { data: T | undefined; isPending: boolean; error: unknown; refetch: () => unknown; isFetching?: boolean };
  loading?: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <>{loading ?? <LoadingRows />}</>;
  if (query.data === undefined) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const stale = query.error ? <StaleDataNotice error={query.error} retrying={Boolean(query.isFetching)} onRetry={() => void query.refetch()} /> : null;
  if (empty && isEmpty?.(query.data)) {
    return (
      <>
        {stale}
        {empty}
      </>
    );
  }
  return (
    <>
      {stale}
      {children(query.data)}
    </>
  );
}
