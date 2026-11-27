import { ArrowLeft, ExternalLink, FileText, Link2, Maximize2, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Badge, PageHeader, Surface } from '@/components/ui/Display';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { useBrainGraph, useBrainNote } from '@/features/brain/api';
import { useInsightsArea } from '@/features/insights/area';
import { InsightsFailure } from '@/features/insights/components';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import type { AssistantBrainGraph } from '@/types/api';

/*
 * Mapa do cérebro: o vault do Obsidian (Backend/cerebro) desenhado como o "Graph view" do Obsidian.
 * Cada bolinha é uma nota, cada linha um [[link]] entre notas, a cor é a pasta de primeiro nível.
 * O grafo é uma simulação de forças simples em <canvas> (sem biblioteca); a lista de resultados da busca
 * e o painel da nota são a alternativa acessível ao canvas.
 */

const PALETTE = ['#2F6FB5', '#845DF2', '#B7791F', '#C2417A', '#1E7F4F', '#3E8FA0', '#8A6E4B', '#D0633A', '#6B717A'];

const topFolder = (folder: string) => folder.split('/')[0] ?? folder;

interface SimNode {
  id: string;
  title: string;
  group: string;
  color: string;
  degree: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
}

interface View {
  selectedId: string | null;
  query: string;
  hidden: ReadonlySet<string>;
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function GraphCanvas({ graph, colors, view, onSelect }: { graph: AssistantBrainGraph; colors: Map<string, string>; view: View; onSelect: (id: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  const onSelectRef = useRef(onSelect);
  const apiRef = useRef<{ fit: () => void; focus: (id: string) => void; draw: () => void } | null>(null);

  useEffect(() => {
    viewRef.current = view;
    onSelectRef.current = onSelect;
    apiRef.current?.draw();
  }, [view, onSelect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // ---- montagem: posições iniciais agrupadas por pasta (converge mais rápido e já separa as cores)
    const groups = [...new Set(graph.nodes.map((node) => topFolder(node.folder)))];
    const degree = new Map<string, number>();
    for (const edge of graph.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    const nodes: SimNode[] = graph.nodes.map((node, index) => {
      const group = topFolder(node.folder);
      const angle = (groups.indexOf(group) / Math.max(groups.length, 1)) * Math.PI * 2;
      const spread = 60 + ((index * 37) % 120);
      return {
        id: node.id,
        title: node.title,
        group,
        color: colors.get(group) ?? PALETTE[PALETTE.length - 1]!,
        degree: degree.get(node.id) ?? 0,
        x: Math.cos(angle) * 220 + Math.cos(index) * spread,
        y: Math.sin(angle) * 220 + Math.sin(index) * spread,
        vx: 0,
        vy: 0,
        fixed: false,
      };
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const links = graph.edges.map((edge) => [byId.get(edge.source), byId.get(edge.target)] as const).filter((pair): pair is readonly [SimNode, SimNode] => Boolean(pair[0] && pair[1]));
    const neighbors = new Map<string, Set<string>>();
    for (const [a, b] of links) {
      (neighbors.get(a.id) ?? neighbors.set(a.id, new Set()).get(a.id)!).add(b.id);
      (neighbors.get(b.id) ?? neighbors.set(b.id, new Set()).get(b.id)!).add(a.id);
    }
    const radius = (node: SimNode) => 3 + Math.sqrt(node.degree) * 1.6;

    let width = 0;
    let height = 0;
    let dpr = 1;
    const transform = { x: 0, y: 0, k: 1 };
    let alpha = 1;
    let frame = 0;
    let hovered: SimNode | null = null;

    // ---- simulação de forças: repulsão entre todas as notas, mola em cada link, leve gravidade ao centro
    const tick = () => {
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i]!;
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j]!;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 > 90_000) continue;
          if (d2 < 1) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d2 = 1;
          }
          const force = (-260 * alpha) / d2;
          a.vx += dx * force;
          a.vy += dy * force;
          b.vx -= dx * force;
          b.vy -= dy * force;
        }
      }
      for (const [a, b] of links) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const pull = ((d - 46) / d) * 0.04 * alpha;
        a.vx += dx * pull;
        a.vy += dy * pull;
        b.vx -= dx * pull;
        b.vy -= dy * pull;
      }
      for (const node of nodes) {
        node.vx -= node.x * 0.004 * alpha;
        node.vy -= node.y * 0.004 * alpha;
        if (node.fixed) {
          node.vx = 0;
          node.vy = 0;
          continue;
        }
        node.vx *= 0.6;
        node.vy *= 0.6;
        node.x += node.vx;
        node.y += node.vy;
      }
      alpha *= 0.985;
    };

    const draw = () => {
      const { selectedId, query, hidden } = viewRef.current;
      const q = normalize(query.trim());
      const focusId = hovered?.id ?? selectedId;
      const focusSet = focusId ? neighbors.get(focusId) : undefined;
      const visible = (node: SimNode) => !hidden.has(node.group);
      const matches = (node: SimNode) => !q || normalize(node.title).includes(q) || normalize(node.id).includes(q);
      const lit = (node: SimNode) => (focusId ? node.id === focusId || Boolean(focusSet?.has(node.id)) : matches(node));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.translate(width / 2 + transform.x, height / 2 + transform.y);
      ctx.scale(transform.k, transform.k);

      ctx.lineWidth = 1 / transform.k;
      for (const [a, b] of links) {
        if (!visible(a) || !visible(b)) continue;
        const touches = focusId !== null && (a.id === focusId || b.id === focusId);
        ctx.strokeStyle = touches ? 'rgba(13,109,83,0.75)' : focusId || q ? 'rgba(142,148,156,0.12)' : 'rgba(142,148,156,0.35)';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (const node of nodes) {
        if (!visible(node)) continue;
        ctx.globalAlpha = lit(node) ? 1 : 0.18;
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius(node), 0, Math.PI * 2);
        ctx.fill();
        if (node.id === selectedId) {
          ctx.strokeStyle = '#1A1D21';
          ctx.lineWidth = 2 / transform.k;
          ctx.stroke();
          ctx.lineWidth = 1 / transform.k;
        }
      }
      ctx.globalAlpha = 1;
      // rótulos: todos com zoom; sem zoom, só a nota em foco, as vizinhas e os resultados da busca
      ctx.font = `${12 / transform.k}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      // rótulos que se sobrepõem são pulados; a nota em foco e as mais ligadas têm prioridade
      const candidates = nodes
        .filter((node) => visible(node) && (focusId ? lit(node) : q ? matches(node) : transform.k >= 1.6 || node.degree >= 8))
        .sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId) || b.degree - a.degree);
      const placed: Array<[number, number, number, number]> = [];
      const lineHeight = 14 / transform.k;
      for (const node of candidates) {
        const label = node.title.length > 38 ? `${node.title.slice(0, 36)}…` : node.title;
        const y = node.y + radius(node) + 3 / transform.k;
        const half = ctx.measureText(label).width / 2;
        const box: [number, number, number, number] = [node.x - half, y, node.x + half, y + lineHeight];
        if (placed.some((other) => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1])) continue;
        placed.push(box);
        ctx.lineWidth = 3 / transform.k;
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.strokeText(label, node.x, y);
        ctx.fillStyle = node.id === focusId ? '#1A1D21' : '#555B63';
        ctx.fillText(label, node.x, y);
      }
    };

    const loop = () => {
      if (alpha > 0.02) tick();
      draw();
      frame = alpha > 0.02 ? requestAnimationFrame(loop) : 0;
    };
    const reheat = (to = 0.3) => {
      alpha = Math.max(alpha, to);
      if (!frame) frame = requestAnimationFrame(loop);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const toGraph = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (clientX - rect.left - width / 2 - transform.x) / transform.k, y: (clientY - rect.top - height / 2 - transform.y) / transform.k };
    };
    const hit = (clientX: number, clientY: number) => {
      const point = toGraph(clientX, clientY);
      const { hidden } = viewRef.current;
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const node of nodes) {
        if (hidden.has(node.group)) continue;
        const d = Math.hypot(node.x - point.x, node.y - point.y);
        if (d < radius(node) + 6 / transform.k && d < bestD) {
          best = node;
          bestD = d;
        }
      }
      return best;
    };

    // ---- interação: arrastar nota, arrastar o fundo (mover), roda (zoom), clique (abrir nota)
    let drag: { node: SimNode | null; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null = null;
    const onDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      const node = hit(event.clientX, event.clientY);
      drag = { node, startX: event.clientX, startY: event.clientY, originX: transform.x, originY: transform.y, moved: false };
      if (node) node.fixed = true;
    };
    const onMove = (event: PointerEvent) => {
      if (!drag) {
        const next = hit(event.clientX, event.clientY);
        if (next !== hovered) {
          hovered = next;
          canvas.style.cursor = next ? 'pointer' : 'grab';
          draw();
        }
        return;
      }
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.node) {
        const point = toGraph(event.clientX, event.clientY);
        drag.node.x = point.x;
        drag.node.y = point.y;
        reheat(0.15);
      } else {
        transform.x = drag.originX + dx;
        transform.y = drag.originY + dy;
        canvas.style.cursor = 'grabbing';
        draw();
      }
    };
    const onUp = () => {
      if (!drag) return;
      if (drag.node) drag.node.fixed = false;
      if (!drag.moved) onSelectRef.current(drag.node?.id ?? null);
      drag = null;
      canvas.style.cursor = hovered ? 'pointer' : 'grab';
    };
    const onLeave = () => {
      if (hovered && !drag) {
        hovered = null;
        draw();
      }
    };
    const zoomAt = (factor: number, clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left - width / 2;
      const py = clientY - rect.top - height / 2;
      const k = Math.min(6, Math.max(0.15, transform.k * factor));
      const ratio = k / transform.k;
      transform.x = px - (px - transform.x) * ratio;
      transform.y = py - (py - transform.y) * ratio;
      transform.k = k;
      draw();
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const fit = () => {
      const shown = nodes.filter((node) => !viewRef.current.hidden.has(node.group));
      if (shown.length === 0 || width === 0) return;
      const xs = shown.map((node) => node.x);
      const ys = shown.map((node) => node.y);
      const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const k = Math.min(2, Math.max(0.15, 0.9 * Math.min(width / (maxX - minX + 60), height / (maxY - minY + 60))));
      transform.k = k;
      transform.x = -((minX + maxX) / 2) * k;
      transform.y = -((minY + maxY) / 2) * k;
      draw();
    };
    const focus = (id: string) => {
      const node = byId.get(id);
      if (!node) return;
      transform.k = Math.max(transform.k, 1.4);
      transform.x = -node.x * transform.k;
      transform.y = -node.y * transform.k;
      draw();
    };
    apiRef.current = { fit, focus, draw };

    // aquece a simulação fora da tela e enquadra, para não abrir com as bolinhas "explodindo"
    for (let i = 0; i < 120; i += 1) tick();
    fit();
    reheat(alpha);
    const initial = viewRef.current.selectedId;
    if (initial) focus(initial);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      apiRef.current = null;
    };
  }, [graph, colors]);

  // nota escolhida fora do canvas (busca, link no painel): centraliza nela
  useEffect(() => {
    if (view.selectedId) apiRef.current?.focus(view.selectedId);
  }, [view.selectedId]);

  return (
    <div className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-lg border border-line bg-paper">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none cursor-grab"
        role="img"
        aria-label={`Grafo do cérebro com ${graph.nodes.length} notas e ${graph.edges.length} ligações. Use a busca ou a lista ao lado para abrir uma nota.`}
      />
      <div className="absolute right-3 top-3">
        <IconButton label="Enquadrar o grafo" icon={Maximize2} onClick={() => apiRef.current?.fit()} className="bg-white border border-line" />
      </div>
      <p className="pointer-events-none absolute bottom-2 left-3 text-caption text-mist">Arraste para mover · role para aproximar · clique numa nota para ler</p>
    </div>
  );
}

function NotePanel({ id, onSelect }: { id: string; onSelect: (id: string | null) => void }) {
  const note = useBrainNote(id);
  if (note.isPending) return <LoadingRows rows={5} />;
  if (!note.data) return <InsightsFailure error={note.error} onRetry={() => void note.refetch()} />;
  const data = note.data;
  return (
    <article aria-labelledby="brain-note-title" className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-caption text-mist break-words">{data.folder}</p>
          <h2 id="brain-note-title" className="text-h3 font-semibold text-ink break-words">
            {data.title}
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={data.generated ? 'neutral' : 'success'}>{data.generated ? 'Gerada da fonte oficial' : 'Revisada pela equipe'}</Badge>
            {data.updated ? <Badge>Atualizada {formatRelative(data.updated)}</Badge> : null}
            {data.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} tone="info">
                #{tag}
              </Badge>
            ))}
          </div>
        </div>
        <IconButton label="Fechar a nota" icon={X} size="sm" onClick={() => onSelect(null)} />
      </header>
      {data.sourceUrl ? (
        <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-small font-medium text-action hover:underline">
          <ExternalLink size={16} aria-hidden />
          {data.sourceLabel ?? 'Fonte oficial'}
        </a>
      ) : null}
      <div className="flex flex-col gap-3">
        {data.sections.map((section) => (
          <section key={section.anchor || section.heading}>
            {section.heading && section.heading !== data.title ? <h3 className="text-body font-semibold text-ink">{section.heading}</h3> : null}
            <p className="mt-0.5 whitespace-pre-line text-small text-slate">{section.text}</p>
          </section>
        ))}
      </div>
      {data.links.length > 0 ? (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-small font-semibold text-ink">
            <Link2 size={16} aria-hidden /> Links desta nota
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {data.links.map((link) =>
              link.id ? (
                <li key={link.label}>
                  <button type="button" onClick={() => onSelect(link.id)} className="rounded-sm border border-line px-2 py-0.5 text-caption text-action hover:bg-action-soft">
                    {link.label}
                  </button>
                </li>
              ) : (
                <li key={link.label} className="rounded-sm border border-dashed border-line-strong px-2 py-0.5 text-caption text-mist" title="Assunto citado que ainda não tem nota">
                  {link.label}
                </li>
              ),
            )}
          </ul>
        </section>
      ) : null}
      <section>
        <h3 className="mb-1.5 text-small font-semibold text-ink">Notas que apontam para esta ({data.backlinks.length})</h3>
        {data.backlinks.length === 0 ? (
          <p className="text-caption text-mist">Nenhuma nota liga para esta ainda.</p>
        ) : (
          <ul className="flex flex-col">
            {data.backlinks.map((backlink) => (
              <li key={backlink.id}>
                <button type="button" onClick={() => onSelect(backlink.id)} className="w-full rounded-sm px-1.5 py-1 text-left text-small text-ink hover:bg-snow">
                  {backlink.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

/** Mapa do cérebro do assistente, estilo Obsidian: grafo das notas e leitura de cada uma. */
export default function BrainGraphPage() {
  const { can } = useSession();
  const allowed = can('kb:read:all');
  const { to } = useInsightsArea();
  const graph = useBrainGraph(allowed);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('nota');
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of graph.data?.nodes ?? []) counts.set(topFolder(node.folder), (counts.get(topFolder(node.folder)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [graph.data]);
  const colors = useMemo(() => new Map(groups.map(([group], index) => [group, PALETTE[index % PALETTE.length]!])), [groups]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q || !graph.data) return [];
    return graph.data.nodes.filter((node) => normalize(node.title).includes(q) || normalize(node.id).includes(q)).slice(0, 8);
  }, [graph.data, query]);

  const select = (id: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) next.set('nota', id);
        else next.delete('nota');
        return next;
      },
      { replace: true },
    );
  const view = useMemo<View>(() => ({ selectedId, query, hidden }), [selectedId, query, hidden]);

  if (!allowed) return <AccessDenied />;

  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink to={to('cerebro-assistente')} variant="ghost" size="sm" icon={ArrowLeft}>
            Cérebro do assistente
          </ButtonLink>
        }
        title="Mapa do cérebro"
        description="Todas as notas que o assistente consulta, ligadas como no Obsidian. Cada ponto é uma nota, cada linha um link entre elas, e a cor mostra a pasta. Clique numa nota para ler o que o assistente sabe sobre o assunto."
      />
      {graph.isPending ? (
        <LoadingRows rows={6} />
      ) : graph.data === undefined ? (
        <InsightsFailure error={graph.error} onRetry={() => void graph.refetch()} />
      ) : graph.data.nodes.length === 0 ? (
        <EmptyState icon={FileText} title="O cérebro ainda não tem notas" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="relative w-full lg:max-w-sm">
              <label htmlFor="brain-search" className="sr-only">
                Buscar nota
              </label>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist" />
              <input
                id="brain-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Buscar entre ${graph.data.nodes.length} notas`}
                className="h-10 w-full rounded-md border border-line-strong bg-white pl-9 pr-3 text-body text-ink placeholder:text-fog focus:border-action focus:outline-none"
              />
              {results.length > 0 ? (
                <ul aria-label="Notas encontradas" className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line bg-white">
                  {results.map((node) => (
                    <li key={node.id}>
                      <button
                        type="button"
                        onClick={() => {
                          select(node.id);
                          setQuery('');
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-snow"
                      >
                        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors.get(topFolder(node.folder)) }} />
                        <span className="min-w-0">
                          <span className="block truncate text-small text-ink">{node.title}</span>
                          <span className="block truncate text-caption text-mist">{node.folder}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <fieldset className="flex flex-wrap gap-1.5">
              <legend className="sr-only">Pastas exibidas</legend>
              {groups.map(([group, total]) => {
                const off = hidden.has(group);
                return (
                  <button
                    key={group}
                    type="button"
                    aria-pressed={!off}
                    onClick={() =>
                      setHidden((current) => {
                        const next = new Set(current);
                        if (next.has(group)) next.delete(group);
                        else next.add(group);
                        return next;
                      })
                    }
                    className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-caption', off ? 'border-line text-fog line-through' : 'border-line-strong bg-white text-ink')}
                  >
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: off ? 'transparent' : colors.get(group), border: `1.5px solid ${colors.get(group)}` }} />
                    {group} <span className="text-mist">{total}</span>
                  </button>
                );
              })}
              {hidden.size > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => setHidden(new Set())}>
                  Mostrar todas
                </Button>
              ) : null}
            </fieldset>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <GraphCanvas graph={graph.data} colors={colors} view={view} onSelect={select} />
            <Surface className="lg:max-h-[62vh] lg:overflow-y-auto" aria-label="Nota selecionada">
              {selectedId ? (
                <NotePanel key={selectedId} id={selectedId} onSelect={select} />
              ) : (
                <EmptyState
                  icon={FileText}
                  title="Escolha uma nota"
                  description={`${graph.data.nodes.length} notas e ${graph.data.edges.length} ligações. Clique num ponto do mapa ou busque um assunto para ver o texto que o assistente usa para responder.`}
                />
              )}
            </Surface>
          </div>
        </div>
      )}
    </>
  );
}
