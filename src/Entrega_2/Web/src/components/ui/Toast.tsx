import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: ToastTone; message: string }
interface ToastValue { show(message: string, tone?: ToastTone): void }
const ToastContext = createContext<ToastValue | null>(null);
let nextId = 1;
const ICONS = { success: CheckCircle2, error: CircleAlert, info: Info };
const TONES: Record<ToastTone, string> = { success: 'border-success/30 text-success-text', error: 'border-danger/30 text-danger-text', info: 'border-info/30 text-info-text' };

/** Notificações Radix: sucessos somem sozinhos; erros permanecem até fechar. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, tone: ToastTone = 'success') => { const id = nextId++; setItems((current) => [...current.slice(-3), { id, tone, message }]); }, []);
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const value = useMemo(() => ({ show }), [show]);
  return <ToastPrimitive.Provider swipeDirection="right" duration={4500}><ToastContext.Provider value={value}>
    {children}
    {items.map((item) => { const IconGlyph = ICONS[item.tone]; return <ToastPrimitive.Root key={item.id} open onOpenChange={(open) => { if (!open) dismiss(item.id); }} duration={item.tone === 'error' ? Infinity : 4500} className={cn('flex items-start gap-2.5 rounded-lg border bg-white px-4 py-3 text-ink shadow-lg data-[state=open]:animate-[asa-toast-in_180ms_ease-out] data-[state=closed]:animate-[asa-toast-out_120ms_ease-in]', TONES[item.tone])}>
      <IconGlyph size={20} className="mt-px shrink-0" aria-hidden /><ToastPrimitive.Description className="flex-1 text-body">{item.message}</ToastPrimitive.Description><ToastPrimitive.Close aria-label="Fechar aviso" className="rounded-sm text-mist hover:text-ink"><X size={18} aria-hidden /></ToastPrimitive.Close>
    </ToastPrimitive.Root>; })}
    {items.length ? <ToastPrimitive.Viewport aria-label="Notificações" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 outline-none [&>li]:pointer-events-auto" /> : null}
  </ToastContext.Provider></ToastPrimitive.Provider>;
}
export function useToast(): ToastValue { const value = useContext(ToastContext); if (!value) throw new Error('useToast precisa do ToastProvider'); return value; }
