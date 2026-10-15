import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { ToastProvider } from '@/components/ui/Toast';
import { SessionProvider } from '@/features/auth/session';
import { isApiError } from '@/services/api/client';
import { createRouter } from './router';

/** Repetição automática só em leitura e só para falhas temporárias (rede, servidor). Escritas nunca repetem sozinhas. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (isApiError(error) && !['network', 'timeout', 'server', 'dependency'].includes(error.kind)) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export default function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createRouter);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
