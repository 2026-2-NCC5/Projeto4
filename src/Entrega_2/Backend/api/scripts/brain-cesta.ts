import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVaultDir } from '../src/brain/readVault.js';

/**
 * Recria `cerebro/Cesta de Serviços do ASA/` (vault do Obsidian) a partir da Cesta de Serviços PÚBLICA do ASA
 * (database/content/asa_cesta_de_servicos.json — o mesmo arquivo que `npm run db:content` carrega na Base de
 * conhecimento). Uma nota por serviço e uma nota-índice por categoria, todas ligadas à nota do ASA: assim o
 * cérebro também responde pelos serviços e o grafo mostra a Cesta inteira.
 *
 *   npm run brain:cesta   (depois: npm run brain:build && npm test)
 */
interface Service {
  slug: string;
  url: string;
  title: string;
  category: { slug: string; label: string };
  audiences: string[];
  blocks: Array<{ tag: string; text: string }>;
  conditions: string[];
  sector: string | null;
  location: string | null;
  hours: string | null;
  channels: { phones?: string[]; emails?: string[]; whatsapp?: string[] };
}

export const CESTA_FOLDER = 'Cesta de Serviços do ASA';
export const ASA_NOTE = 'ASA - Área do Sucesso Alvarista';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(here, '../../database/content/asa_cesta_de_servicos.json');

const fileName = (title: string): string => title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);
const linkTarget = (title: string): string => fileName(title);

function phone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}

function serviceMarkdown(service: Service, updated: string): string {
  const intro = service.blocks.map((block) => (block.tag === 'li' ? `- ${block.text}` : block.text)).join('\n\n').trim();
  const where: string[] = [];
  if (service.sector) where.push(`- Setor responsável: ${service.sector}`);
  if (service.location) where.push(`- Onde: ${service.location}`);
  if (service.hours) where.push(`- Horário: ${service.hours}`);
  for (const value of service.channels.phones ?? []) where.push(`- Telefone: ${phone(value)}`);
  for (const value of service.channels.whatsapp ?? []) where.push(`- WhatsApp: ${phone(value)}`);
  for (const value of service.channels.emails ?? []) where.push(`- E-mail: ${value}`);
  const parts = [
    '---',
    `title: ${service.title}`,
    `tags: [asa, cesta-de-servicos, ${service.category.slug}]`,
    `source_label: Cesta de Serviços do ASA — ${service.title}`,
    `source_url: ${service.url}`,
    `updated: ${updated}`,
    'generated: true',
    '---',
    `# ${service.title}`,
    '',
    '%% Nota gerada por `npm run brain:cesta` a partir da Cesta de Serviços pública do ASA — edições à mão aqui se perdem. %%',
    '',
    intro || `Serviço da Cesta de Serviços do ASA na categoria ${service.category.label}.`,
    '',
    // rótulos nos links: o nome da categoria não entra no texto pesquisável do serviço (evita que "Transporte e
    // Estacionamento" faça o passe escolar responder "tem estacionamento?")
    `Serviço da Cesta de Serviços do [[${ASA_NOTE}|ASA]] ([[${linkTarget(service.category.label)}|ver os outros serviços da categoria]]).${service.audiences.length ? ` Para: ${service.audiences.join(', ')}.` : ''}`,
  ];
  if (service.conditions.length) parts.push('', `## Condições para ${service.title}`, '', service.conditions.map((item) => item.trim()).join('\n'));
  if (where.length) parts.push('', `## Onde e quando pedir ${service.title}`, '', where.join('\n'));
  return `${parts.join('\n')}\n`;
}

function categoryMarkdown(label: string, services: Service[], updated: string): string {
  return [
    '---',
    `title: ${label}`,
    `aliases: [serviços de ${label.toLowerCase()} do ASA]`,
    `tags: [asa, cesta-de-servicos, categoria]`,
    `source_label: Cesta de Serviços do ASA — ${label}`,
    `source_url: https://www.fecap.br/asa/cesta-de-servicos/`,
    `updated: ${updated}`,
    'generated: true',
    '---',
    `# ${label}`,
    '',
    `Categoria da Cesta de Serviços do [[${ASA_NOTE}]] com ${services.length} ${services.length === 1 ? 'serviço' : 'serviços'}.`,
    '',
    `## Serviços de ${label}`,
    '',
    ...services.map((service) => `- [[${linkTarget(service.title)}]]`),
    '',
  ].join('\n');
}

function main(): void {
  const data = JSON.parse(readFileSync(SOURCE, 'utf8')) as { fetchedAt?: string; services: Service[] };
  const updated = (data.fetchedAt ?? new Date().toISOString()).slice(0, 10);
  const vault = resolveVaultDir();
  const out = path.join(vault, CESTA_FOLDER);
  rmSync(out, { recursive: true, force: true });
  const byCategory = new Map<string, { label: string; slug: string; services: Service[] }>();
  for (const service of data.services) {
    const bucket = byCategory.get(service.category.slug) ?? { label: service.category.label, slug: service.category.slug, services: [] };
    bucket.services.push(service);
    byCategory.set(service.category.slug, bucket);
  }
  let written = 0;
  for (const { label, services } of byCategory.values()) {
    services.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    const dir = path.join(out, fileName(label));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(out, `${fileName(label)}.md`), categoryMarkdown(label, services, updated));
    for (const service of services) {
      writeFileSync(path.join(dir, `${fileName(service.title)}.md`), serviceMarkdown(service, updated));
      written += 1;
    }
  }
  console.error(`${written} serviços em ${byCategory.size} categorias gravados em ${CESTA_FOLDER}/. Agora: npm run brain:build`);
}

main();
