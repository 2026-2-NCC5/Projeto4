import { describe, expect, it } from 'vitest';
import { addDays, dateRange, daysBetween, formatKeyLong, formatRange, isDateKey, startOfWeek, weekdayOf } from './dates';
import { staffActionState } from './rules';

describe('datas de calendário (fuso da instituição)', () => {
  it('soma dias atravessando mês e ano sem depender do fuso do computador', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-15', '2026-11-14')).toBe(30);
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('semana de segunda a domingo e dia da semana no padrão da API (0 = domingo)', () => {
    expect(weekdayOf('2026-10-15')).toBe(4);
    expect(startOfWeek('2026-10-15')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12');
  });

  it('valida e formata sem deslocar o dia', () => {
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2026-10-15')).toBe(true);
    expect(formatKeyLong('2026-10-15')).toBe('quinta-feira, 15 de outubro');
    expect(formatRange('2026-10-12', '2026-10-18')).toBe('12 a 18 de outubro de 2026');
    expect(formatRange('2026-10-26', '2026-11-01')).toBe('26 de outubro a 1 de novembro de 2026');
  });
});

describe('ações da equipe por situação e horário', () => {
  const slot = { startsAt: '2026-10-15T14:00:00.000Z', endsAt: '2026-10-15T14:30:00.000Z' };
  const at = (iso: string) => new Date(iso);

  it('agendado: confirma até o fim; conclui/ausência só depois do início', () => {
    expect(staffActionState({ ...slot, status: 'scheduled' }, at('2026-10-15T13:00:00.000Z'))).toMatchObject({ confirm: true, complete: false, noShow: false, cancel: true });
    expect(staffActionState({ ...slot, status: 'scheduled' }, at('2026-10-15T14:10:00.000Z'))).toMatchObject({ confirm: true, complete: true, noShow: true, cancel: true });
    expect(staffActionState({ ...slot, status: 'scheduled' }, at('2026-10-15T14:30:00.000Z'))).toMatchObject({ confirm: false, complete: true, noShow: true });
  });

  it('confirmado não confirma de novo; encerrados não mudam', () => {
    expect(staffActionState({ ...slot, status: 'confirmed' }, at('2026-10-15T13:00:00.000Z'))).toMatchObject({ confirm: false, complete: false, cancel: true });
    for (const status of ['completed', 'cancelled', 'no_show'] as const) {
      expect(staffActionState({ ...slot, status }, at('2026-10-15T15:00:00.000Z'))).toMatchObject({ confirm: false, complete: false, noShow: false, cancel: false });
    }
  });
});
