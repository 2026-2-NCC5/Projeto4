import { describe, expect, it } from 'vitest';
import { makeTicket } from './testing/fixtures';
import { buildProgress } from './progress';
import { matchesSearch, statusParam } from './utils';

describe('progresso do chamado (4 etapas)', () => {
  it('em análise: recebido e triagem concluídos, análise atual', () => {
    const progress = buildProgress(makeTicket({ status: 'in_analysis' }));
    expect(progress.steps.map((step) => step.state)).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(progress.steps[2]!.label).toBe('Em análise');
    expect(progress.next?.label).toBe('Conclusão da análise');
  });

  it('cancelado mostra até onde chegou e não finge conclusão', () => {
    const progress = buildProgress(makeTicket({ status: 'cancelled', canRate: false }));
    expect(progress.cancelled).toBe(true);
    expect(progress.steps.map((step) => step.state)).toEqual(['done', 'done', 'skipped', 'skipped']);
    expect(progress.currentDescription).toBeNull();
  });

  it('encerrado sem resolução aparece como "Encerrado"; resolvido pede avaliação', () => {
    expect(buildProgress(makeTicket({ status: 'closed', closedAt: '2026-10-15T00:00:00.000Z', canRate: false })).steps[3]!.label).toBe('Encerrado');
    const resolved = buildProgress(makeTicket({ status: 'resolved', resolvedAt: '2026-10-15T00:00:00.000Z', canRate: true }));
    expect(resolved.steps.every((step) => step.state === 'done')).toBe(true);
    expect(resolved.steps[3]!.label).toBe('Resolvido');
    expect(resolved.next?.label).toBe('Sua avaliação');
  });
});

describe('utilitários', () => {
  it('filtros viram o parâmetro status da API', () => {
    expect(statusParam('all')).toBeUndefined();
    expect(statusParam('waiting')).toBe('waiting_student');
    expect(statusParam('finished')).toBe('resolved,closed,cancelled');
  });

  it('busca ignora acentos e maiúsculas e exige todos os termos', () => {
    expect(matchesSearch('historico ESCOLAR', ['Como obter o Histórico escolar?'])).toBe(true);
    expect(matchesSearch('histórico boleto', ['Como obter o histórico escolar?'])).toBe(false);
    expect(matchesSearch('  ', ['qualquer'])).toBe(true);
  });
});
