import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { LoadingRows } from '@/components/feedback/States';

/** Página carregada sob demanda (cada área vira um pedaço separado do bundle). */
export function page(loader: () => Promise<{ default: ComponentType }>, fallback: ReactNode = <LoadingRows />) {
  const Component = lazy(loader);
  return (
    <Suspense fallback={fallback}>
      <Component />
    </Suspense>
  );
}

export function pageWith<P extends object>(loader: () => Promise<{ default: ComponentType<P> }>, props: P) {
  const Component = lazy(loader);
  return (
    <Suspense fallback={<LoadingRows />}>
      <Component {...props} />
    </Suspense>
  );
}
