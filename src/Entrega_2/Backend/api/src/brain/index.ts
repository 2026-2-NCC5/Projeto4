import { canonicalSearchText, SHORT_TERMS, STOPWORDS } from '../knowledge/text.js';
import type { GroundingArticle } from '../knowledge/service.js';
import type { BrainNote, BrainSection, BrainSnapshot } from './vault.js';

/**
 * Busca no cérebro (vault do Obsidian): BM25 por seção, com o título e os apelidos (aliases) da nota
 * pesando mais, bônus quando a pergunta cita um apelido inteiro e um empurrão para as notas ligadas por
 * [[links]] às mais relevantes (o "grafo" do Obsidian). Tudo em memória: o vault tem dezenas/centenas de
 * notas e a busca leva poucos milissegundos.
 */

/** "FECAP" e "ASA" são palavras vazias para a base de artigos, mas aqui identificam as notas institucionais. */
const BRAIN_STOPWORDS = new Set([...STOPWORDS].filter((word) => word !== 'fecap' && word !== 'asa'));

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 3;
const HEADING_WEIGHT = 2;
const ALIAS_PHRASE_BONUS = 2.5;
const LINK_BONUS = 0.2;
/** Notas abaixo desta fração da melhor nota não entram (evitam contexto que só confunde a IA). */
const RELATIVE_CUTOFF = 0.35;
const MIN_SCORE = 0.8;
const BODY_MAX = 2_800;
/** Notas geradas do site valem um pouco menos que as escritas e revisadas pela equipe. */
const GENERATED_FACTOR = 0.85;

function stem(term: string): string {
  if (term.length > 5) return term.slice(0, 5);
  return term.length === 5 ? term.slice(0, 4) : term;
}

export function brainTokens(text: string): string[] {
  return canonicalSearchText(text)
    .split(/[^a-z0-9]+/)
    .filter((term) => (term.length >= 3 || SHORT_TERMS.has(term)) && !BRAIN_STOPWORDS.has(term))
    .map(stem);
}

interface IndexedSection {
  note: BrainNote;
  section: BrainSection;
  tf: Map<string, number>;
  length: number;
  titleTerms: Set<string>;
}

export interface BrainHit {
  note: BrainNote;
  sections: BrainSection[];
  score: number;
}

export interface BrainStats {
  hash: string;
  notes: number;
  sections: number;
  links: number;
  folders: Record<string, number>;
  /** links [[...]] que não apontam para nenhuma nota (lacunas do grafo) */
  danglingLinks: string[];
}

const keyOf = (value: string): string => canonicalSearchText(value).trim();

/** Jeitos diferentes de perguntar a mesma coisa (radicais): "quanto custa" ≈ "valor" ≈ "taxa". */
const SYNONYM_GROUPS = [
  ['cust', 'valor', 'preco', 'taxa', 'mensa'],
  ['horar', 'funci'],
  ['ender', 'local', 'onde', 'fica'],
  ['telef', 'whats', 'conta', 'email'],
  ['inici', 'comec'],
  ['prazo', 'data', 'quando'],
  ['desco', 'bolsa'],
].map((group) => group.map((term) => stem(term)));
const SYNONYM_WEIGHT = 0.5;
/** Termo da pergunta no título da nota: sinal forte de que a nota é sobre aquilo. */
const TITLE_TERM_BONUS = 1.2;

export class BrainIndex {
  private readonly sections: IndexedSection[];
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;
  private readonly byKey = new Map<string, BrainNote>();
  private readonly aliasKeys: Array<{ key: string; note: BrainNote }> = [];

  constructor(readonly snapshot: BrainSnapshot) {
    for (const note of snapshot.notes) {
      this.byKey.set(keyOf(note.id.split('/').pop()!), note);
      this.byKey.set(keyOf(note.title), note);
      for (const alias of note.aliases) {
        const key = keyOf(alias);
        if (key.length >= 5) this.aliasKeys.push({ key, note });
        if (!this.byKey.has(key)) this.byKey.set(key, note);
      }
    }
    this.sections = snapshot.notes.flatMap((note) => {
      const titleTokens = brainTokens([note.title, ...note.aliases].join(' '));
      return note.sections.map((section) => {
        const tf = new Map<string, number>();
        const add = (tokens: string[], weight: number): void => tokens.forEach((token) => tf.set(token, (tf.get(token) ?? 0) + weight));
        const body = brainTokens(section.text);
        add(body, 1);
        add(titleTokens, TITLE_WEIGHT);
        add(brainTokens(section.heading), HEADING_WEIGHT);
        return { note, section, tf, length: body.length + titleTokens.length, titleTerms: new Set(brainTokens(note.title)) };
      });
    });
    for (const entry of this.sections) for (const token of entry.tf.keys()) this.df.set(token, (this.df.get(token) ?? 0) + 1);
    this.avgLength = this.sections.reduce((sum, entry) => sum + entry.length, 0) / Math.max(1, this.sections.length);
  }

  get size(): number {
    return this.snapshot.notes.length;
  }

  /** Nota citada por um link [[...]] (pelo nome do arquivo, título ou apelido). */
  resolve(link: string): BrainNote | null {
    return this.byKey.get(keyOf(link)) ?? null;
  }

  search(question: string, limit = 3): BrainHit[] {
    const terms = [...new Set(brainTokens(question))];
    if (terms.length === 0 || this.sections.length === 0) return [];
    const weights = new Map(terms.map((term) => [term, 1]));
    const synonymsOf = new Map<string, string[]>();
    for (const term of terms) {
      for (const group of SYNONYM_GROUPS) {
        if (!group.includes(term)) continue;
        synonymsOf.set(term, [...(synonymsOf.get(term) ?? []), ...group.filter((synonym) => synonym !== term)]);
        for (const synonym of group) if (!weights.has(synonym)) weights.set(synonym, SYNONYM_WEIGHT);
      }
    }
    const total = this.sections.length;
    const idf = new Map([...weights.keys()].map((term) => {
      const df = this.df.get(term) ?? 0;
      return [term, Math.log(1 + (total - df + 0.5) / (df + 0.5))];
    }));
    const normalized = ` ${keyOf(question).replace(/[^a-z0-9]+/g, ' ')} `;
    const aliasHits = new Set(this.aliasKeys.filter(({ key }) => normalized.includes(` ${key.replace(/[^a-z0-9]+/g, ' ').trim()} `)).map(({ note }) => note.id));

    const perNote = new Map<string, { note: BrainNote; scored: Array<{ section: BrainSection; score: number }> }>();
    for (const entry of this.sections) {
      let score = 0;
      for (const [term, weight] of weights) {
        const freq = entry.tf.get(term);
        if (!freq) continue;
        score += weight * idf.get(term)! * ((freq * (K1 + 1)) / (freq + K1 * (1 - B + (B * entry.length) / this.avgLength)));
      }
      if (score > 0) {
        // seção que cobre TODOS os termos (ou sinônimos) vence a que repete muito um só deles
        const covered = terms.filter((term) => entry.tf.has(term) || (synonymsOf.get(term) ?? []).some((synonym) => entry.tf.has(synonym))).length;
        score = score * (0.4 + (0.6 * covered) / terms.length) + terms.filter((term) => entry.titleTerms.has(term)).length * TITLE_TERM_BONUS;
      }
      if (aliasHits.has(entry.note.id)) score += ALIAS_PHRASE_BONUS;
      if (score <= 0) continue;
      if (entry.note.generated) score *= GENERATED_FACTOR;
      const bucket = perNote.get(entry.note.id) ?? { note: entry.note, scored: [] };
      bucket.scored.push({ section: entry.section, score });
      perNote.set(entry.note.id, bucket);
    }

    const ranked = [...perNote.values()].map(({ note, scored }) => {
      scored.sort((a, b) => b.score - a.score);
      return { note, scored, score: scored[0]!.score };
    });
    ranked.sort((a, b) => b.score - a.score);
    // grafo: notas ligadas (ida ou volta) às 3 melhores ganham um empurrão proporcional
    const leaders = ranked.slice(0, 3);
    for (const item of ranked) {
      const bonus = leaders
        .filter((leader) => leader.note.id !== item.note.id)
        .filter((leader) => leader.note.links.some((link) => this.resolve(link)?.id === item.note.id) || item.note.links.some((link) => this.resolve(link)?.id === leader.note.id))
        .reduce((max, leader) => Math.max(max, leader.score * LINK_BONUS), 0);
      item.score += bonus;
    }
    ranked.sort((a, b) => b.score - a.score);
    const best = ranked[0]?.score ?? 0;
    if (best < MIN_SCORE) return [];
    return ranked
      .filter((item) => item.score >= best * RELATIVE_CUTOFF)
      .slice(0, limit)
      .map(({ note, scored, score }) => {
        // a melhor seção, a segunda se for quase tão boa, e a introdução da nota para dar contexto
        const chosen = scored.filter((entry, index) => index === 0 || entry.score >= scored[0]!.score * 0.6).slice(0, 2).map((entry) => entry.section);
        const intro = note.sections[0]!;
        const sections = chosen.includes(intro) ? chosen : [intro, ...chosen];
        return { note, sections: note.sections.filter((section) => sections.includes(section)), score };
      });
  }

  /** Trechos do cérebro no formato que a IA recebe junto com os artigos do ASA. */
  grounding(question: string, limit = 3): GroundingArticle[] {
    return this.search(question, limit).map(({ note, sections }) => {
      const body = sections.map((section) => (section.heading ? `## ${section.heading}\n${section.text}` : section.text)).join('\n\n');
      return {
        articleId: `cerebro:${note.id}`,
        slug: brainSlug(note),
        title: note.title,
        summary: [note.sourceLabel, note.updated ? `${note.tags.includes('noticia') ? 'notícia publicada' : 'atualizada'} em ${note.updated}` : null].filter(Boolean).join(' · ') || 'Nota do cérebro da FECAP',
        body: body.length > BODY_MAX ? `${body.slice(0, BODY_MAX)}…` : body,
        version: 1,
        publishedAt: null,
        sourceLabel: note.sourceLabel,
        sourceUrl: note.sourceUrl,
        origin: 'brain',
      };
    });
  }

  stats(): BrainStats {
    const folders: Record<string, number> = {};
    const dangling = new Set<string>();
    let links = 0;
    for (const note of this.snapshot.notes) {
      const folder = note.id.includes('/') ? note.id.split('/')[0]! : '(raiz)';
      folders[folder] = (folders[folder] ?? 0) + 1;
      for (const link of note.links) {
        links += 1;
        if (!this.resolve(link)) dangling.add(link);
      }
    }
    return { hash: this.snapshot.hash, notes: this.snapshot.notes.length, sections: this.sections.length, links, folders, danglingLinks: [...dangling].sort() };
  }
}

export function brainSlug(note: BrainNote): string {
  return `cerebro-${keyOf(note.id).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}
