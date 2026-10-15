import { describe, expect, it } from 'vitest';
import { appointmentIcs, icsText } from '../../src/appointments/ics.js';
import { generateSlots } from '../../src/appointments/slots.js';
import type { AvailabilityRecord } from '../../src/appointments/types.js';
import { addDays, localDate, localTime, weekdayOf, zonedTimeToUtc } from '../../src/lib/zonedTime.js';

const TZ = 'America/Sao_Paulo';
const rule = (overrides: Partial<AvailabilityRecord>): AvailabilityRecord => ({
  id: 'rule-1',
  attendantUserId: 'attendant-a',
  attendantName: 'Atendente A',
  weekday: 2,
  startTime: '09:00',
  endTime: '11:00',
  slotMinutes: 30,
  mode: 'presencial',
  location: 'Central ASA',
  validFrom: '2026-01-01',
  validUntil: null,
  active: true,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('fuso da instituição', () => {
  it('converte horário de parede de São Paulo para UTC e volta', () => {
    expect(zonedTimeToUtc('2026-11-17', '09:00', TZ).toISOString()).toBe('2026-11-17T12:00:00.000Z');
    expect(localDate(new Date('2026-11-18T02:30:00Z'), TZ)).toBe('2026-11-17');
    expect(localTime(new Date('2026-11-17T12:00:00Z'), TZ)).toBe('09:00');
    expect(weekdayOf('2026-11-17')).toBe(2);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('respeita fusos com horário de verão (ex.: Nova York na mudança de março)', () => {
    expect(zonedTimeToUtc('2026-03-07', '09:00', 'America/New_York').toISOString()).toBe('2026-03-07T14:00:00.000Z');
    expect(zonedTimeToUtc('2026-03-09', '09:00', 'America/New_York').toISOString()).toBe('2026-03-09T13:00:00.000Z');
  });
});

describe('geração de horários a partir da disponibilidade', () => {
  const now = new Date('2026-11-16T11:00:00Z'); // segunda, 08:00 em São Paulo

  it('gera faixas pelo tamanho do horário, no dia da semana certo e com o fim respeitado', () => {
    const slots = generateSlots({ rules: [rule({})], from: '2026-11-16', to: '2026-11-22', timeZone: TZ, now, minLeadHours: 2, busy: [] });
    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual(['2026-11-17T12:00:00.000Z', '2026-11-17T12:30:00.000Z', '2026-11-17T13:00:00.000Z', '2026-11-17T13:30:00.000Z']);
    expect(slots[0]).toMatchObject({ mode: 'presencial', location: 'Central ASA', candidates: [{ attendantUserId: 'attendant-a', availabilityId: 'rule-1' }] });
    expect(slots[0]!.endsAt.getTime() - slots[0]!.startsAt.getTime()).toBe(30 * 60_000);
  });

  it('desconta antecedência mínima, horários ocupados e regras inativas ou fora da vigência', () => {
    const monday = rule({ id: 'rule-mon', weekday: 1, startTime: '09:00', endTime: '11:00' });
    const busy = [{ attendantUserId: 'attendant-a', startsAt: new Date('2026-11-16T13:30:00Z'), endsAt: new Date('2026-11-16T14:00:00Z') }];
    const slots = generateSlots({ rules: [monday, rule({ id: 'off', active: false }), rule({ id: 'old', validUntil: '2026-10-31' })], from: '2026-11-16', to: '2026-11-17', timeZone: TZ, now, minLeadHours: 2, busy });
    // 08:00 + 2 h = 10:00 → 09:00 e 09:30 saem; 10:30 está ocupado
    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual(['2026-11-16T13:00:00.000Z']);
  });

  it('agrupa atendentes livres no mesmo horário e filtra por modalidade', () => {
    const rules = [rule({}), rule({ id: 'rule-b', attendantUserId: 'attendant-b' }), rule({ id: 'online', mode: 'online', location: null, startTime: '18:00', endTime: '19:00' })];
    const presencial = generateSlots({ rules, from: '2026-11-17', to: '2026-11-17', timeZone: TZ, now, minLeadHours: 0, busy: [], mode: 'presencial' });
    expect(presencial[0]!.candidates.map((candidate) => candidate.attendantUserId)).toEqual(['attendant-a', 'attendant-b']);
    expect(presencial.every((slot) => slot.mode === 'presencial')).toBe(true);
    const online = generateSlots({ rules, from: '2026-11-17', to: '2026-11-17', timeZone: TZ, now, minLeadHours: 0, busy: [], mode: 'online' });
    expect(online).toHaveLength(2);
  });
});

describe('arquivo de calendário (.ics)', () => {
  it('escapa texto e descreve o atendimento sem simular confirmação externa', () => {
    expect(icsText('a,b;c\\d\nlinha')).toBe('a\\,b\\;c\\\\d\\nlinha');
    const ics = appointmentIcs({
      id: 'appt-1',
      protocol: 'AGD-2026-00100',
      title: 'Atendimento ASA — Documentos',
      description: 'Protocolo AGD-2026-00100; traga documento',
      location: 'Central ASA',
      startsAt: new Date('2026-11-17T12:00:00Z'),
      endsAt: new Date('2026-11-17T12:30:00Z'),
      now: new Date('2026-11-16T11:00:00Z'),
      cancelled: false,
    });
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART:20261117T120000Z');
    expect(ics).toContain('UID:appt-1@asa-conecta');
    expect(ics).toContain('DESCRIPTION:Protocolo AGD-2026-00100\\; traga documento');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
