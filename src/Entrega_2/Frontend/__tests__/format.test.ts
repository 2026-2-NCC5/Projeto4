import {
  firstName,
  formatConfidence,
  formatDate,
  formatPercent,
  formatScore,
  initials,
  recommendationTypeLabel,
  runStatusLabel,
} from '../utils/format';

describe('utils/format', () => {
  it('formata datas pt-BR', () => {
    expect(formatDate('2026-09-21')).toBe('21/09/2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('inválida')).toBe('—');
  });

  it('formata percentuais e notas', () => {
    expect(formatPercent(0.9)).toBe('90%');
    expect(formatPercent(null)).toBe('—');
    expect(formatScore(8.2)).toBe('8,2');
    expect(formatConfidence(0.87)).toBe('87% de confiança');
    expect(formatConfidence(null)).toBeNull();
  });

  it('rotula tipos de recomendação e status', () => {
    expect(recommendationTypeLabel('pending_activity')).toBe('Atividade pendente');
    expect(recommendationTypeLabel('attendance_attention')).toBe('Frequência em atenção');
    expect(recommendationTypeLabel('attendance_critical')).toBe('Frequência abaixo do mínimo');
    expect(recommendationTypeLabel('performance_attention')).toBe('Desempenho em atenção');
    expect(recommendationTypeLabel('institutional_validation')).toBe('Validação institucional');
    expect(recommendationTypeLabel('algo_novo')).toBe('Algo novo');
    expect(runStatusLabel('no_action')).toBe('Sem ações necessárias');
  });

  it('nome e iniciais', () => {
    expect(firstName('Maria Silva Souza')).toBe('Maria');
    expect(firstName('')).toBe('Estudante');
    expect(initials('Maria Silva Souza')).toBe('MS');
  });
});
