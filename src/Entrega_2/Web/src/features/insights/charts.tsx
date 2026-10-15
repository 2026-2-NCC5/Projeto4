import { ChartColumn, Table2 } from 'lucide-react';
import { useEffect, useId, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatCalendarDate, formatNumber, formatPercent } from '@/lib/format';
import type { MetricsBreakdown } from '@/types/api';

/**
 * Gráficos simples e acessíveis, sem dependência nova (SVG/HTML à mão). Regras do método dataviz:
 * - cores das séries: azul e laranja da paleta categórica validada (validate_palette.js, tema claro,
 *   superfície #fff: contraste ≥ 3:1, separação para daltonismo ΔE 24,7). O verde #0D6D53 fica só para ações;
 * - identidade nunca só pela cor: legenda, rótulo direto no fim da linha e marcador de formato diferente;
 * - linhas de 2 px, barras de no máximo 24 px com ponta arredondada de 4 px, grade em linha fina e sólida;
 * - camada de interação (cruz de leitura + dica) com o mesmo conteúdo no teclado;
 * - todo gráfico tem a tabela equivalente ("Ver como tabela").
 */
export const CHART_COLORS = {
  series: ['#2a78d6', '#eb6834'] as const,
  grid: '#eceef0',
  axis: '#cbd0d5',
  /** texto de eixo: #6b717a sobre branco = 4,9:1 */
  text: '#6b717a',
  label: '#555b63',
  surface: '#ffffff',
};

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const tickText = (value: number) => (value >= 1000 ? compact.format(value) : formatNumber(value));

/** Escala "redonda" para o eixo Y (0, 2, 4…; 0, 5, 10…), sempre com passos inteiros (contagens). */
export function niceTicks(max: number, target = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rough = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const nice = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
  const step = Math.max(1, nice * magnitude);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(value);
  return ticks;
}

/** Largura real do contêiner (o SVG é desenhado em pixels reais: texto sempre legível, sem distorção). */
function useElementWidth(fallback: number) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(Math.round(next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width] as const;
}

// ---------------------------------------------------------------- moldura e tabela

/**
 * Moldura de um gráfico: título, descrição e a alternância gráfico ↔ tabela (a tabela é o equivalente
 * completo para leitores de tela, impressão e quem prefere números).
 */
export function ChartFigure({ title, description, legend, table, children, className }: { title: string; description?: ReactNode; legend?: ReactNode; table: ReactNode; children: ReactNode; className?: string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const titleId = useId();
  const bodyId = useId();
  return (
    <figure aria-labelledby={titleId} className={cn('m-0 min-w-0', className)}>
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <h3 id={titleId} className="text-h4 font-semibold text-ink">
            {title}
          </h3>
          {description ? <p className="mt-0.5 text-small text-slate">{description}</p> : null}
        </div>
        <Button size="sm" variant="ghost" icon={view === 'chart' ? Table2 : ChartColumn} aria-controls={bodyId} onClick={() => setView(view === 'chart' ? 'table' : 'chart')} className="-mx-3">
          {view === 'chart' ? 'Ver como tabela' : 'Ver como gráfico'}
        </Button>
      </figcaption>
      {view === 'chart' && legend ? <div className="mb-3">{legend}</div> : null}
      <div id={bodyId}>{view === 'chart' ? children : table}</div>
    </figure>
  );
}

export interface TableRow {
  key: string;
  cells: ReactNode[];
}

/**
 * Tabela de dados em contêiner rolável e focável pelo teclado (tabelas largas ou longas rolam aqui dentro,
 * nunca a página). A primeira coluna é o cabeçalho de cada linha.
 */
export function DataTableView({
  caption,
  headers,
  rows,
  numeric = [],
  maxHeightClass = 'max-h-80',
  minWidthClass = 'min-w-[18rem]',
}: {
  caption: string;
  headers: string[];
  rows: TableRow[];
  numeric?: number[];
  maxHeightClass?: string;
  /** largura mínima: abaixo dela a tabela rola dentro do contêiner em vez de espremer as colunas */
  minWidthClass?: string;
}) {
  return (
    <div role="region" aria-label={caption} tabIndex={0} className={cn('overflow-auto rounded-md border border-line bg-white', maxHeightClass)}>
      <table className={cn('w-full border-collapse text-left text-small', minWidthClass)}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th
                key={header}
                scope="col"
                className={cn('sticky top-0 border-b border-line bg-paper px-3 py-2 text-caption font-semibold text-slate', numeric.includes(index) && 'whitespace-nowrap text-right')}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line-soft last:border-b-0">
              {row.cells.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row" className="px-3 py-2 font-normal text-ink">
                    {cell}
                  </th>
                ) : (
                  <td key={index} className={cn('px-3 py-2 text-ink', numeric.includes(index) && 'whitespace-nowrap text-right tabular-nums')}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- linhas (série diária)

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
}

type MarkerShape = 'circle' | 'square';
const MARKERS: MarkerShape[] = ['circle', 'square'];

function Marker({ shape, x, y, color, size }: { shape: MarkerShape; x: number; y: number; color: string; size: number }) {
  // anel de 2 px na cor da superfície: o marcador continua legível sobre a linha ou sobre outro marcador
  return shape === 'circle' ? (
    <circle cx={x} cy={y} r={size / 2} fill={color} stroke={CHART_COLORS.surface} strokeWidth={2} paintOrder="stroke" />
  ) : (
    <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx={1.5} fill={color} stroke={CHART_COLORS.surface} strokeWidth={2} paintOrder="stroke" />
  );
}

/** Chave da legenda/dica: traço curto da cor da série com o marcador da série (linha, não caixa). */
export function LineKey({ index }: { index: number }) {
  const color = CHART_COLORS.series[index % CHART_COLORS.series.length]!;
  const shape = MARKERS[index % MARKERS.length]!;
  return (
    <svg width={22} height={12} aria-hidden className="shrink-0">
      <line x1={1} y1={6} x2={21} y2={6} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Marker shape={shape} x={11} y={6} color={color} size={8} />
    </svg>
  );
}

/** Legenda (sempre presente com 2+ séries): chave + nome + total do período. */
export function LineLegend({ series }: { series: LineSeries[] }) {
  return (
    <ul aria-label="Legenda" className="flex flex-wrap gap-x-5 gap-y-1">
      {series.map((item, index) => (
        <li key={item.key} className="flex items-center gap-2 text-small text-slate">
          <LineKey index={index} />
          <span>
            <span className="text-ink">{item.label}</span> · {formatNumber(item.values.reduce((sum, value) => sum + value, 0))} no período
          </span>
        </li>
      ))}
    </ul>
  );
}

function shortDate(date: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[2]}/${match[1]}` : date;
}

/** Resumo textual do gráfico (rótulo do SVG): totais e o dia de maior movimento de cada série. */
export function summarizeSeries(dates: string[], series: LineSeries[]): string {
  return series
    .map((item) => {
      const total = item.values.reduce((sum, value) => sum + value, 0);
      let peak = -1;
      item.values.forEach((value, index) => {
        if (peak < 0 || value > (item.values[peak] ?? 0)) peak = index;
      });
      const peakValue = peak >= 0 ? (item.values[peak] ?? 0) : 0;
      return peakValue > 0
        ? `${item.label}: ${formatNumber(total)} no período; maior valor em um dia: ${formatNumber(peakValue)} em ${formatCalendarDate(dates[peak] ?? '')}.`
        : `${item.label}: nenhum no período.`;
    })
    .join(' ');
}

const HEIGHT = 240;

/**
 * Linhas por dia (até 366 pontos). Cruz de leitura que encaixa no dia mais próximo do ponteiro; pelo teclado,
 * setas percorrem os dias (Home/End vão às pontas) e a leitura é anunciada numa região viva.
 */
export function DailyLineChart({ dates, series, label }: { dates: string[]; series: LineSeries[]; label: string }) {
  const [setContainer, width] = useElementWidth(640);
  const [active, setActive] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const titleId = useId();
  const descId = useId();
  const n = dates.length;

  const max = Math.max(0, ...series.flatMap((item) => item.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? 1;
  const yLabelWidth = Math.max(...ticks.map((tick) => tickText(tick).length)) * 7 + 10;
  const showEndLabels = width >= 520;
  const margin = { top: 14, right: showEndLabels ? 96 : 14, bottom: 30, left: Math.max(30, yLabelWidth) };
  const plotW = Math.max(40, width - margin.left - margin.right);
  const plotH = HEIGHT - margin.top - margin.bottom;
  const x = (index: number) => margin.left + (n <= 1 ? plotW / 2 : (index * plotW) / (n - 1));
  const y = (value: number) => margin.top + plotH - (value / top) * plotH;
  const allMarkers = n <= 31;

  // rótulos do eixo X: ~1 a cada 72 px, sempre com o último dia
  const slots = Math.max(2, Math.floor(plotW / 72));
  const step = Math.max(1, Math.ceil((n - 1) / (slots - 1)));
  const xTicks: number[] = [];
  for (let index = 0; index < n; index += step) if (n - 1 - index >= step / 2 || index === n - 1) xTicks.push(index);
  if (n > 0 && xTicks[xTicks.length - 1] !== n - 1) xTicks.push(n - 1);

  // rótulos diretos no fim das linhas; se colidirem, a legenda e a dica bastam (nada de empilhar)
  const ends = series.map((item) => y(item.values[n - 1] ?? 0));
  const endsCollide = ends.some((value, index) => ends.some((other, j) => j !== index && Math.abs(value - other) < 16));

  const pointText = (index: number) =>
    `${formatCalendarDate(dates[index] ?? '')}: ${series.map((item) => `${item.label} ${formatNumber(item.values[index] ?? 0)}`).join(', ')}`;

  const onPointer = (event: PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const scale = rect.width > 0 ? width / rect.width : 1;
    const px = (event.clientX - rect.left) * scale;
    const index = n <= 1 ? 0 : Math.round(((px - margin.left) / plotW) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, index)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const current = active ?? n - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = Math.min(n - 1, current + 1);
    if (event.key === 'ArrowLeft') next = Math.max(0, current - 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = n - 1;
    if (event.key === 'Escape') {
      setActive(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  };

  const tooltipLeft = active !== null ? x(active) : 0;
  const flip = tooltipLeft > width * 0.55;

  return (
    <div
      ref={setContainer}
      className="relative w-full rounded-md outline-offset-2"
      tabIndex={0}
      role="group"
      aria-label={`${label}. Use as setas para percorrer os dias.`}
      onKeyDown={onKeyDown}
      onFocus={() => {
        setFocused(true);
        setActive((current) => current ?? (n > 0 ? n - 1 : null));
      }}
      onBlur={() => {
        setFocused(false);
        setActive(null);
      }}
    >
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-labelledby={`${titleId} ${descId}`} className="block max-w-full select-none">
        <title id={titleId}>{label}</title>
        <desc id={descId}>{summarizeSeries(dates, series)}</desc>
        {/* grade e eixo Y */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={margin.left} x2={margin.left + plotW} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? CHART_COLORS.axis : CHART_COLORS.grid} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={12} fill={CHART_COLORS.text} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {tickText(tick)}
            </text>
          </g>
        ))}
        {/* eixo X */}
        {xTicks.map((index) => (
          <text key={index} x={x(index)} y={margin.top + plotH + 20} textAnchor={index === 0 && n > 1 ? 'start' : index === n - 1 && n > 1 ? 'end' : 'middle'} fontSize={12} fill={CHART_COLORS.text} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {shortDate(dates[index] ?? '')}
          </text>
        ))}
        {/* cruz de leitura */}
        {active !== null ? <line x1={x(active)} x2={x(active)} y1={margin.top} y2={margin.top + plotH} stroke={CHART_COLORS.axis} strokeWidth={1} shapeRendering="crispEdges" /> : null}
        {/* séries */}
        {series.map((item, seriesIndex) => {
          const color = CHART_COLORS.series[seriesIndex % CHART_COLORS.series.length]!;
          const shape = MARKERS[seriesIndex % MARKERS.length]!;
          const path = item.values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
          return (
            <g key={item.key}>
              {n > 1 ? <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
              {item.values.map((value, index) =>
                allMarkers || index === n - 1 || index === active ? (
                  <Marker key={index} shape={shape} x={x(index)} y={y(value)} color={color} size={index === active ? 10 : 8} />
                ) : null,
              )}
              {showEndLabels && !endsCollide && n > 0 ? (
                <text x={x(n - 1) + 10} y={y(item.values[n - 1] ?? 0)} dy="0.32em" fontSize={12} fill={CHART_COLORS.label}>
                  {item.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {/* área de leitura maior que as marcas */}
        <rect
          x={margin.left - 8}
          y={margin.top}
          width={plotW + 16}
          height={plotH}
          fill="transparent"
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => {
            if (!focused) setActive(null);
          }}
        />
      </svg>
      {active !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 min-w-[10rem] rounded-md border border-line-strong bg-white px-3 py-2"
          style={{ left: tooltipLeft, top: margin.top, transform: flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}
        >
          <p className="text-caption text-slate">{formatCalendarDate(dates[active] ?? '')}</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {series.map((item, index) => (
              <li key={item.key} className="flex items-center gap-2 text-small">
                <LineKey index={index} />
                <span className="font-semibold text-ink tabular-nums">{formatNumber(item.values[active] ?? 0)}</span>
                <span className="text-slate">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {focused && active !== null ? pointText(active) : ''}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- barras horizontais

/**
 * Barras horizontais de uma série (categorias nominais): todas na mesma cor, sem legenda (o título diz o que
 * é), rótulo e valor sempre visíveis, participação no total ao lado. Barra fina (10 px) crescendo de uma base.
 */
export function BarList({ items, label, total }: { items: MetricsBreakdown[]; label: string; total?: number }) {
  const max = Math.max(0, ...items.map((item) => item.count));
  const sum = total ?? items.reduce((acc, item) => acc + item.count, 0);
  const color = CHART_COLORS.series[0];
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {items.map((item) => {
        const width = max > 0 ? (item.count / max) * 100 : 0;
        const share = sum > 0 ? item.count / sum : null;
        return (
          <li key={item.key} className="group min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words text-small text-ink">{item.label}</span>
              <span className="shrink-0 text-small tabular-nums text-ink">
                {formatNumber(item.count)}
                {share !== null ? <span className="text-slate"> · {formatPercent(share)}</span> : null}
              </span>
            </div>
            <div className="mt-1 border-l border-line-strong py-px">
              <div
                aria-hidden
                className="h-2.5 rounded-r-[4px] transition-opacity duration-150 group-hover:opacity-75"
                style={{ width: `${width}%`, minWidth: item.count > 0 ? 3 : 0, backgroundColor: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Tabela equivalente de uma lista de barras (categoria, quantidade e participação). */
export function BarTable({ items, caption, firstHeader, total }: { items: MetricsBreakdown[]; caption: string; firstHeader: string; total?: number }) {
  const sum = total ?? items.reduce((acc, item) => acc + item.count, 0);
  return (
    <DataTableView
      caption={caption}
      headers={[firstHeader, 'Quantidade', 'Participação']}
      numeric={[1, 2]}
      rows={items.map((item) => ({ key: item.key, cells: [item.label, formatNumber(item.count), sum > 0 ? formatPercent(item.count / sum) : '—'] }))}
    />
  );
}

/** Lista de barras com título, tabela equivalente e estado vazio próprio. */
export function BreakdownChart({ title, description, items, firstHeader, emptyText, total }: { title: string; description?: ReactNode; items: MetricsBreakdown[]; firstHeader: string; emptyText: string; total?: number }) {
  if (items.length === 0) {
    return (
      <section className="min-w-0">
        <h3 className="text-h4 font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-0.5 text-small text-slate">{description}</p> : null}
        <p className="mt-3 text-small text-slate">{emptyText}</p>
      </section>
    );
  }
  return (
    <ChartFigure title={title} description={description} table={<BarTable items={items} caption={title} firstHeader={firstHeader} {...(total !== undefined ? { total } : {})} />}>
      <BarList items={items} label={title} {...(total !== undefined ? { total } : {})} />
    </ChartFigure>
  );
}
