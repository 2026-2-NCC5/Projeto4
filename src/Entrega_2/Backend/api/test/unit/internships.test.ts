import { describe, expect, it } from 'vitest';
import { validateInternship, type InternshipData } from '../../src/internships/service.js';

const complete = {
  student: { fullName: 'Maria Oliveira Costa', email: 'maria@example.test', address: { zipCode: '01310-100', state: 'SP', city: 'São Paulo', neighborhood: 'Bela Vista', street: 'Avenida Paulista', number: '1000', complement: 'Apartamento 1204, Bloco B' } },
  company: { legalName: 'Empresa Exemplo Ltda.', cnpj: '00.000.000/0000-00' },
  contract: { startDate: '2026-11-01', endDate: '2027-10-31', activities: 'Apoio administrativo supervisionado' },
} satisfies InternshipData;

describe('validação de estágio', () => {
  it('preserva endereço completo de teste e permite gerar documento válido', () => {
    expect(validateInternship(complete)).toEqual([]);
  });

  it('bloqueia documento quando template omite logradouro e número', () => {
    const issues = validateInternship(complete, ['student.address.street', 'student.address.number']);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'student.address.street', message: expect.stringContaining('não foi encontrado no documento') }),
      expect.objectContaining({ field: 'student.address.number', message: expect.stringContaining('não foi encontrado no documento') }),
    ]));
  });

  it('exige declaração explícita para endereço sem número', () => {
    const data = structuredClone(complete);
    const address = data.student.address as Record<string, unknown>;
    address.number = '';
    expect(validateInternship(data).some((issue) => issue.field === 'student.address.number')).toBe(true);
    address.noNumber = true;
    expect(validateInternship(data).some((issue) => issue.field === 'student.address.number')).toBe(false);
  });

  it('recusa CEP inválido e datas incoerentes', () => {
    const data = structuredClone(complete);
    (data.student.address as Record<string, unknown>).zipCode = '123';
    (data.contract as Record<string, unknown>).startDate = '2027-12-01';
    expect(validateInternship(data).map((issue) => issue.field)).toEqual(expect.arrayContaining(['student.address.zipCode', 'contract.endDate']));
  });
});
