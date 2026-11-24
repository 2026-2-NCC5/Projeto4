/**
 * "Cérebro" do assistente: um vault do Obsidian (Backend/cerebro/) com o conhecimento público da FECAP.
 *
 * Cada nota é Markdown com frontmatter (title, aliases, tags, source_label, source_url, updated) e links
 * [[entre notas]]. Aqui só há funções puras: o vault é lido do disco pelo script `npm run brain:build`,
 * que grava o retrato em `vault.generated.ts` — assim a API (inclusive na Vercel) não depende de arquivos
 * fora do pacote e cada mudança no cérebro passa por revisão no Git.
 */
export interface BrainSection {
  /** âncora estável dentro da nota (slug do subtítulo; "" = introdução) */
  anchor: string;
  heading: string;
  text: string;
}

export interface BrainNote {
  /** caminho relativo ao vault, sem ".md" (ex.: "FECAP/Campus Liberdade") */
  id: string;
  title: string;
  aliases: string[];
  tags: string[];
  sourceLabel: string | null;
  sourceUrl: string | null;
  updated: string | null;
  /** nota gerada da sincronização com o site (scripts/sync_fecap_site.py); as curadas pesam mais */
  generated?: boolean;
  /** títulos das notas citadas com [[...]] (resolvidos pelo nome do arquivo ou pelo título) */
  links: string[];
  sections: BrainSection[];
}

export interface BrainSnapshot {
  /** sha-256 (curto) do conteúdo do vault: muda a cada edição */
  hash: string;
  notes: BrainNote[];
}

/** Pastas do vault que não entram no cérebro: rascunhos, modelos e a caixa de entrada de lacunas. */
export const IGNORED_FOLDERS = ['00 Entrada', 'Modelos', '.obsidian', '.trash'];

function slugAnchor(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed;
}

/** Subconjunto de YAML usado nas notas: `chave: valor`, `chave: [a, b]` e listas com "- item". */
export function parseFrontmatter(markdown: string): { data: Record<string, string | string[]>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) return { data: {}, body: markdown };
  const data: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const raw of match[1]!.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (data[listKey] as string[]).push(unquote(item[1]!));
      continue;
    }
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1]!;
    const value = pair[2]!.trim();
    if (value === '') {
      data[key] = [];
      listKey = key;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value.slice(1, -1).split(',').map(unquote).filter(Boolean);
      listKey = null;
    } else {
      data[key] = unquote(value);
      listKey = null;
    }
  }
  return { data, body: markdown.slice(match[0].length) };
}

const asList = (value: string | string[] | undefined): string[] => (Array.isArray(value) ? value : value ? [value] : []).map((item) => item.trim()).filter(Boolean);
const asText = (value: string | string[] | undefined): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Texto legível de um trecho Markdown: links [[nota|rótulo]] viram o rótulo, ênfases e comentários somem. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/^>\s?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractLinks(markdown: string): string[] {
  const links = new Set<string>();
  for (const match of markdown.matchAll(/(?<!!)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g)) {
    const target = match[1]!.trim().split('/').pop()!;
    if (target) links.add(target);
  }
  return [...links];
}

/** Converte uma nota (caminho relativo + conteúdo) em seções pesquisáveis. null = nota vazia. */
export function parseNote(relativePath: string, markdown: string): BrainNote | null {
  const id = relativePath.replace(/\\/g, '/').replace(/\.md$/i, '');
  const { data, body } = parseFrontmatter(markdown);
  const fileTitle = id.split('/').pop()!;
  const h1 = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  const title = asText(data.title) ?? h1 ?? fileTitle;
  const sections: BrainSection[] = [];
  let heading = '';
  let buffer: string[] = [];
  const flush = (): void => {
    const text = plainText(buffer.join('\n'));
    if (text) sections.push({ anchor: slugAnchor(heading), heading, text });
    buffer = [];
  };
  for (const line of body.split(/\r?\n/)) {
    if (/^#\s+/.test(line)) continue; // título da nota (já em `title`)
    const sub = /^#{2,3}\s+(.+)$/.exec(line);
    if (sub) {
      flush();
      heading = sub[1]!.trim();
      continue;
    }
    buffer.push(line);
  }
  flush();
  // "## Fontes" é referência para a equipe, não conteúdo para a resposta
  const content = sections.filter((section) => !/^(fontes?|refer[eê]ncias)$/i.test(section.heading));
  if (content.length === 0) return null;
  const tags = asList(data.tags).map((tag) => tag.replace(/^#/, ''));
  return {
    id,
    title,
    aliases: [...new Set([...asList(data.aliases), ...(title !== fileTitle ? [fileTitle] : [])])],
    tags,
    sourceLabel: asText(data.source_label),
    sourceUrl: asText(data.source_url),
    updated: asText(data.updated),
    ...(asText(data.generated) === 'true' ? { generated: true } : {}),
    links: extractLinks(body),
    sections: content,
  };
}

export function isIgnoredPath(relativePath: string): boolean {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  if (parts.some((part) => part.startsWith('.'))) return true;
  if (parts.length === 1 && /^readme\.md$/i.test(parts[0]!)) return true;
  return IGNORED_FOLDERS.includes(parts[0]!);
}
