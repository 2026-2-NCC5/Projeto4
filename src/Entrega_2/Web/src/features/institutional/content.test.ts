import { describe, expect, it } from 'vitest';
import { fecapUrls, normalizeSearch, officialServices, serviceCategories, staff } from './content';

describe('institutional ASA content', () => {
  it('normalizes case and accents for the catalog search', () => {
    expect(normalizeSearch(' OPORTUNIDADES ')).toBe(normalizeSearch('oportunidades'));
    expect(normalizeSearch('Atestado de matrícula')).toBe(normalizeSearch('atestado de matricula'));
  });

  it('uses real official FECAP destinations for locally indexed service links', () => {
    expect(serviceCategories).toHaveLength(19);
    expect(officialServices.length).toBeGreaterThan(0);
    for (const service of officialServices) {
      expect(service.href.startsWith(fecapUrls.basket)).toBe(true);
      expect(serviceCategories).toContain(service.category);
    }
  });

  it('limits team data to the two professionals listed by the ASA source', () => {
    expect(staff.map((person) => person.name)).toEqual(['Flávia Kao', 'Danielle Vitorino']);
    expect(staff.every((person) => person.linkedin.startsWith('https://www.linkedin.com/'))).toBe(true);
  });
});
