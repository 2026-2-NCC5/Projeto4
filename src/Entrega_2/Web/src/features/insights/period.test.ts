import { describe, expect, it } from 'vitest';
import { niceTicks } from './charts';
import { addDays, describePeriod, inclusiveDays, isCalendarDate, periodParams, periodQuery, presetRange, readPeriod, validateRange } from './period';

const TODAY = '2026-10-15';
const read = (search: string) => readPeriod(new URLSearchParams(search), TODAY);

describe('período dos indicadores (URL ↔ consulta da API)', () => {
  it('sem parâmetros usa os últimos 30 dias, incluindo hoje (o mesmo padrão do servidor)', () => {
    expect(read('')).toMatchObject({ choice: '30', from: '2026-09-16', to: TODAY, days: 30, error: null });
    expect(periodQuery(read(''))).toEqual({ from: '2026-09-16', to: TODAY });
  });

  it('atalhos de 7 e 90 dias contam o dia de hoje', () => {
    expect(periodQuery(read('periodo=7'))).toEqual({ from: '2026-10-09', to: TODAY });
    expect(periodQuery(read('periodo=90'))).toEqual({ from: '2026-07-18', to: TODAY });
    expect(presetRange(7, '2026-03-02')).toEqual({ from: '2026-02-24', to: '2026-03-02' });
    // valor desconhecido na URL volta ao padrão
    expect(read('periodo=15').choice).toBe('30');
  });

  it('datas do calendário viram from/to; período inválido não gera consulta', () => {
    expect(periodQuery(read('de=2026-10-01&ate=2026-10-10'))).toEqual({ from: '2026-10-01', to: '2026-10-10' });
    expect(read('de=2026-10-01&ate=2026-10-10')).toMatchObject({ choice: 'custom', days: 10 });
    expect(read('de=2026-10-10&ate=2026-10-01').error).toBe('A data final deve ser igual ou posterior à inicial.');
    expect(read('de=2025-10-14&ate=2026-10-15').error).toBe('Escolha um período de até 366 dias.');
    expect(read('de=2025-10-15&ate=2026-10-15').error).toBeNull(); // 366 dias: o limite exato
    expect(read('de=2026-10-01&ate=2026-10-20').error).toBe('A data final não pode ser depois de hoje.');
    expect(read('periodo=personalizado').error).toBe('Informe a data inicial e a data final.');
    expect(read('de=2026-02-30&ate=2026-03-01').error).toBe('Use datas válidas (dia, mês e ano).');
    expect(periodQuery(read('de=2026-10-10&ate=2026-10-01'))).toBeNull();
  });

  it('parâmetros da URL para cada escolha (30 dias é o padrão e não aparece)', () => {
    const current = { from: '2026-10-09', to: TODAY };
    expect(periodParams('7', current)).toEqual({ periodo: '7', de: null, ate: null });
    expect(periodParams('30', current)).toEqual({ periodo: null, de: null, ate: null });
    expect(periodParams('custom', current)).toEqual({ periodo: 'personalizado', de: '2026-10-09', ate: TODAY });
  });

  it('aritmética de datas sem fuso e descrição legível', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(inclusiveDays('2026-10-01', '2026-10-01')).toBe(1);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(validateRange('', TODAY, TODAY)).toBe('Informe a data inicial e a data final.');
    expect(describePeriod({ from: '2026-10-09', to: TODAY })).toBe('09/10/2026 a 15/10/2026 (7 dias)');
    expect(describePeriod({ from: TODAY, to: TODAY })).toBe('15/10/2026 (1 dia)');
  });
});

describe('escala do eixo Y', () => {
  it('usa passos redondos e inteiros que cobrem o maior valor', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(10)).toEqual([0, 5, 10]);
    expect(niceTicks(44)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(1200).at(-1)).toBeGreaterThanOrEqual(1200);
  });
});
