import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { useToast } from '@/components/ui/Toast';

interface State { failed: boolean }

function ErrorFallback() {
  const toast = useToast();
  useEffect(() => { toast.show('Ocorreu um erro inesperado nesta tela. Recarregue a página para continuar.', 'error'); }, [toast]);
  return <main className="grid min-h-[60vh] place-items-center px-4 py-10"><section role="alert" className="w-full max-w-lg rounded-xl border border-danger/25 bg-white p-6 text-center shadow-sm"><p className="text-caption font-bold uppercase tracking-wider text-danger-text">Erro inesperado</p><h1 className="mt-2 text-2xl font-bold text-fecap">Esta tela não pôde ser exibida.</h1><p className="mt-3 text-body leading-6 text-slate">Tente recarregar. Se o problema continuar, entre novamente ou contate o suporte do ASA.</p><button type="button" onClick={() => window.location.reload()} className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-action px-4 text-small font-semibold text-white hover:bg-action-hover">Recarregar página</button></section></main>;
}

/** Captura exceções de renderização e mantém uma ação segura de recuperação para a pessoa usuária. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Evita registrar stack traces e dados de contexto em consoles compartilhados.
  }
  render() { return this.state.failed ? <ErrorFallback /> : this.props.children; }
}
