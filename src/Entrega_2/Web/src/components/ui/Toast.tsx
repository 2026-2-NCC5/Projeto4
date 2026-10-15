import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastValue {
  show(message: string, tone?: ToastTone): void;
}

const ToastContext = createContext<ToastValue | null>(null);
let nextId = 1;

const ICONS = { success: CheckCircle2, error: CircleAlert, info: Info };
const TONES: Record<ToastTone, string> = {
  success: 'border-success/30 text-success-text',
  error: 'border-danger/30 text-danger-text',
  info: 'border-line text-ink',
};

/** Avisos breves em região aria-live (anunciados por leitores de tela). Erros ficam até serem fechados. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId++;
      setItems((current) => [...current.slice(-3), { id, tone, message }]);
      if (tone !== 'error') setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {items.map((item) => {
          const IconGlyph = ICONS[item.tone];
          return (
            <div key={item.id} className={cn('pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-white px-4 py-3 asa-appear', TONES[item.tone])}>
              <IconGlyph size={20} className="mt-px shrink-0" aria-hidden />
              <p className="flex-1 text-body text-ink">{item.message}</p>
              <button type="button" aria-label="Fechar aviso" className="text-mist hover:text-ink" onClick={() => dismiss(item.id)}>
                <X size={18} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast precisa do ToastProvider');
  return value;
}
