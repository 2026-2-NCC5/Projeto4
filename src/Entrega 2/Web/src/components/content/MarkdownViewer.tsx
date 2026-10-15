import { Fragment, type ReactNode } from 'react';

/**
 * Markdown restrito e seguro para artigos da base de conhecimento: títulos (##, ###), parágrafos, listas
 * (- e 1.), **negrito**, *itálico*, `código` e links https. Gera elementos React (nunca HTML bruto), então
 * não há como injetar script; links externos abrem em nova aba com rel="noopener noreferrer".
 */
export function MarkdownViewer({ source, className }: { source: string; className?: string }) {
  return <div className={className ?? 'flex flex-col gap-3 text-body text-ink'}>{renderBlocks(source)}</div>;
}

type Block = { type: 'h2' | 'h3' | 'p'; text: string } | { type: 'ul' | 'ol'; items: string[] };

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: heading[1] === '##' ? 'h2' : 'h3', text: heading[2] ?? '' });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((bullet ?? ordered)![1] ?? '');
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

function renderBlocks(source: string): ReactNode[] {
  return parseBlocks(source).map((block, index) => {
    switch (block.type) {
      case 'h2':
        return (
          <h2 key={index} className="text-h3 font-semibold mt-2">
            {renderInline(block.text)}
          </h2>
        );
      case 'h3':
        return (
          <h3 key={index} className="text-h4 font-semibold mt-1">
            {renderInline(block.text)}
          </h3>
        );
      case 'ul':
        return (
          <ul key={index} className="list-disc pl-5 flex flex-col gap-1">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item)}</li>
            ))}
          </ul>
        );
      case 'ol':
        return (
          <ol key={index} className="list-decimal pl-5 flex flex-col gap-1">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item)}</li>
            ))}
          </ol>
        );
      default:
        return (
          <p key={index} className="leading-relaxed">
            {renderInline(block.text)}
          </p>
        );
    }
  });
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function renderInline(text: string): ReactNode[] {
  const parts = text.split(INLINE).filter((part) => part !== '');
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded-xs bg-snow px-1 font-mono text-small">{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = link[2] ?? '';
      // somente https (sem javascript:, data:, http:)
      if (/^https:\/\/[^\s]+$/i.test(href)) {
        return (
          <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="text-action underline underline-offset-2 hover:no-underline">
            {link[1]}
          </a>
        );
      }
      return <Fragment key={index}>{link[1]}</Fragment>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}
