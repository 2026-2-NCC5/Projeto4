import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PanelLayout {
  left: number;
  right: number;
  rightCollapsed: boolean;
}

export const DEFAULT_LAYOUT: PanelLayout = { left: 22, right: 31, rightCollapsed: false };
const LIMITS = { left: [16, 36], right: [22, 44] } as const;
const KEY_STEP = 2;

const clamp = (value: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, value));

function load(storageKey: string): PanelLayout {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<PanelLayout>;
    return {
      left: clamp(Number(parsed.left) || DEFAULT_LAYOUT.left, LIMITS.left),
      right: clamp(Number(parsed.right) || DEFAULT_LAYOUT.right, LIMITS.right),
      rightCollapsed: parsed.rightCollapsed === true,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** Só tamanhos: nada do atendimento é guardado no navegador. */
export function usePanelLayout(storageKey: string) {
  const [layout, setLayout] = useState<PanelLayout>(() => load(storageKey));
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // navegador sem armazenamento: o layout só não é lembrado
    }
  }, [layout, storageKey]);
  return [layout, setLayout] as const;
}

function Separator({ label, value, min, max, onChange, onCommitDrag }: { label: string; value: number; min: number; max: number; onChange: (next: number) => void; onCommitDrag: (clientX: number) => void }) {
  const dragging = useRef(false);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowLeft: -KEY_STEP, ArrowRight: KEY_STEP };
    if (event.key in steps) {
      event.preventDefault();
      onChange(value + steps[event.key]!);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChange(min);
    } else if (event.key === 'End') {
      event.preventDefault();
      onChange(max);
    }
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onCommitDrag(event.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="group relative z-10 w-1 shrink-0 cursor-col-resize touch-none bg-line hover:bg-line-strong focus-visible:bg-action focus-visible:outline-none"
    >
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" aria-hidden />
    </div>
  );
}

/**
 * Três painéis na mesma aba, com divisores por mouse, toque e teclado (setas, Home, End).
 * O painel direito pode ser recolhido; o central continua funcionando.
 */
export function ResizablePanels({ layout, onLayoutChange, left, center, right, className }: { layout: PanelLayout; onLayoutChange: (next: PanelLayout) => void; left: ReactNode; center: ReactNode; right: ReactNode; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const percentAt = useCallback((clientX: number) => {
    const box = container.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    return ((clientX - box.left) / box.width) * 100;
  }, []);
  const setLeft = (value: number) => onLayoutChange({ ...layout, left: clamp(value, LIMITS.left) });
  // para o divisor direito, mover para a direita diminui o painel
  const setRight = (value: number) => onLayoutChange({ ...layout, right: clamp(value, LIMITS.right) });
  return (
    <div ref={container} className={cn('flex min-h-0 w-full overflow-hidden rounded-lg border border-line bg-white', className)}>
      <section aria-label="Caixa de entrada" style={{ width: `${layout.left}%` }} className="flex min-h-0 min-w-0 shrink-0 flex-col">
        {left}
      </section>
      <Separator
        label="Ajustar a largura da caixa de entrada"
        value={layout.left}
        min={LIMITS.left[0]}
        max={LIMITS.left[1]}
        onChange={setLeft}
        onCommitDrag={(clientX) => {
          const percent = percentAt(clientX);
          if (percent !== null) setLeft(percent);
        }}
      />
      <section aria-label="Conversa" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {center}
      </section>
      {layout.rightCollapsed ? null : (
        <>
          <Separator
            label="Ajustar a largura do painel de contexto"
            value={layout.right}
            min={LIMITS.right[0]}
            max={LIMITS.right[1]}
            onChange={(next) => setRight(layout.right - (next - layout.right))}
            onCommitDrag={(clientX) => {
              const percent = percentAt(clientX);
              if (percent !== null) setRight(100 - percent);
            }}
          />
          <section aria-label="Contexto do atendimento" style={{ width: `${layout.right}%` }} className="flex min-h-0 min-w-0 shrink-0 flex-col">
            {right}
          </section>
        </>
      )}
    </div>
  );
}
