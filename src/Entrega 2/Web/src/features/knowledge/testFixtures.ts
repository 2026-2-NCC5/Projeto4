import type { KnowledgeManageArticle, KnowledgeManageList, KnowledgeManageSummary, KnowledgeVersion } from '@/types/api';

/** Artigos fixos para os testes da gestão da base de conhecimento. */

export function makeVersion(overrides: Partial<KnowledgeVersion> = {}): KnowledgeVersion {
  return {
    version: 1,
    title: 'Como emitir a segunda via do boleto?',
    summary: 'A segunda via sai no portal financeiro.',
    body: 'A segunda via sai no portal financeiro.\n\n## Passo a passo\n\n1. Entre no portal.\n2. Abra **Financeiro**.',
    sourceLabel: 'Orientação do Financeiro',
    sourceUrl: 'https://www.fecap.br/financeiro',
    changeNote: 'Versão inicial',
    createdAt: '2026-10-10T12:00:00.000Z',
    createdBy: 'Atendente ASA',
    ...overrides,
  };
}

export function makeSummaryArticle(overrides: Partial<KnowledgeManageSummary> = {}): KnowledgeManageSummary {
  return {
    id: 'kb-boleto',
    slug: 'segunda-via-boleto',
    title: 'Como emitir a segunda via do boleto?',
    status: 'published',
    audience: 'student',
    categoryId: 'financial',
    categoryLabel: 'Financeiro',
    currentVersion: 1,
    publishedVersion: 1,
    hasUnpublishedChanges: false,
    isDemo: true,
    lastEditor: 'Atendente ASA',
    updatedAt: '2026-10-10T12:00:00.000Z',
    publishedAt: '2026-10-10T12:00:00.000Z',
    reviewDueAt: null,
    ...overrides,
  };
}

export function makeArticle(overrides: Partial<KnowledgeManageArticle> = {}): KnowledgeManageArticle {
  const current = overrides.current ?? makeVersion();
  return {
    ...makeSummaryArticle(),
    current,
    published: current,
    versions: [{ version: 1, createdAt: current.createdAt, createdBy: current.createdBy, changeNote: current.changeNote }],
    canPublish: false,
    publishBlockedReason: 'A versão atual já está publicada.',
    ...overrides,
  };
}

/** Rascunho na versão 2 (para edição e publicação). */
export function makeDraftArticle(overrides: Partial<KnowledgeManageArticle> = {}): KnowledgeManageArticle {
  const current = makeVersion({ version: 2, title: 'Trancamento de matrícula', summary: 'Como pedir o trancamento.', body: '- Abra um chamado.\n- Anexe o formulário.', changeNote: 'Ajuste de texto' });
  return makeArticle({
    id: 'kb-trancamento',
    slug: 'trancamento',
    title: current.title,
    status: 'draft',
    categoryId: 'enrollment',
    categoryLabel: 'Matrícula',
    currentVersion: 2,
    publishedVersion: null,
    publishedAt: null,
    isDemo: false,
    current,
    published: null,
    versions: [
      { version: 2, createdAt: '2026-10-12T12:00:00.000Z', createdBy: 'Atendente ASA', changeNote: 'Ajuste de texto' },
      { version: 1, createdAt: '2026-10-11T12:00:00.000Z', createdBy: 'Atendente ASA', changeNote: null },
    ],
    canPublish: true,
    publishBlockedReason: null,
    ...overrides,
  });
}

export function makeManageList(items: KnowledgeManageSummary[], overrides: Partial<KnowledgeManageList> = {}): KnowledgeManageList {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    counts: { draft: 1, in_review: 0, published: 2, archived: 0 },
    ...overrides,
  };
}
