import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/cn';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** permite ordenar pela coluna (ordenação controlada pelo chamador) */
  sortable?: boolean;
  className?: string;
  /** esconde em telas pequenas (as informações essenciais ficam nas primeiras colunas) */
  hideOnMobile?: boolean;
}

export type SortState = { key: string; direction: 'asc' | 'desc' } | null;

/**
 * Tabela acessível: cabeçalhos <th scope="col">, ordenação anunciada por aria-sort e linha inteira
 * navegável quando há `rowHref` (o link fica na primeira célula para teclado e leitores de tela).
 * O contêiner com rolagem horizontal é uma região focável (tabIndex 0): no celular dá para rolar as
 * colunas pelo teclado mesmo quando a tabela não tem links nem botões.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  sort,
  onSort,
  caption,
  emptyMessage = 'Nenhum registro encontrado.',
  regionLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  sort?: SortState;
  onSort?: (sort: SortState) => void;
  caption: string;
  emptyMessage?: string;
  /** nome da região rolável (padrão: o próprio `caption`) */
  regionLabel?: string;
}) {
  const navigate = useNavigate();
  return (
    <div role="region" aria-label={regionLabel ?? caption} tabIndex={0} className="relative overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-paper">
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const ariaSort = active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : column.sortable ? 'none' : undefined;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn('px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-slate border-b border-line', column.hideOnMobile && 'hidden md:table-cell', column.className)}
                >
                  {column.sortable && onSort ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-ink"
                      onClick={() => onSort(active && sort!.direction === 'asc' ? { key: column.key, direction: 'desc' } : { key: column.key, direction: 'asc' })}
                    >
                      {column.header}
                      {active ? sort!.direction === 'asc' ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden /> : null}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-small text-mist">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  className={cn('border-b border-line-soft last:border-b-0', href && 'cursor-pointer hover:bg-paper')}
                  onClick={href ? (event) => {
                    if ((event.target as HTMLElement).closest('a,button,input,select,textarea')) return;
                    navigate(href);
                  } : undefined}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={cn('px-4 py-3 align-top text-body', column.hideOnMobile && 'hidden md:table-cell', column.className)}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Busca com espera de 350 ms (evita uma requisição por tecla). */
export function SearchInput({ value, onChange, placeholder = 'Buscar', label = 'Buscar' }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string }) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  // valor externo mudou (ex.: limpar filtros): ajusta o texto durante a renderização, sem efeito
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }
  useEffect(() => {
    if (text === value) return undefined;
    const timer = setTimeout(() => onChange(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-9 text-body placeholder:text-mist hover:border-line-strong"
      />
      {text ? (
        <button type="button" aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-mist hover:text-ink" onClick={() => setText('')}>
          <X size={16} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Filtros rápidos exclusivos (equivalente acessível a um grupo de rádio). */
export function FilterChips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string; count?: number }>; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-small transition-colors',
              selected ? 'border-action bg-action-soft text-action font-semibold' : 'border-line bg-white text-slate hover:border-line-strong hover:text-ink',
            )}
          >
            {option.label}
            {option.count !== undefined ? <span className="tabular-nums text-caption">{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function FiltersBar({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
      {trailing ? <div className="flex flex-wrap items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Paginação" className="mt-3 flex items-center justify-between gap-3 text-small text-slate">
      <span>
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => onPage(page - 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white disabled:opacity-40">
          <ChevronLeft size={16} aria-hidden />
        </button>
        <span className="px-2 tabular-nums" aria-current="page">
          {page} / {pages}
        </span>
        <button type="button" aria-label="Próxima página" disabled={page >= pages} onClick={() => onPage(page + 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white disabled:opacity-40">
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
