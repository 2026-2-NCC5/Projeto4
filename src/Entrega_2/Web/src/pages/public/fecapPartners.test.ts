import { describe, expect, it } from 'vitest';
import { fecapPartners } from './fecapPartners';

describe('catálogo público de empresas parceiras da FECAP', () => {
  it('contém perfis e logotipos publicados nos endereços oficiais da FECAP', () => {
    expect(fecapPartners.length).toBeGreaterThan(10);
    expect(new Set(fecapPartners.map((partner) => partner.href)).size).toBe(fecapPartners.length);
    for (const partner of fecapPartners) {
      expect(partner.name.trim()).not.toBe('');
      expect(partner.href).toMatch(/^https:\/\/www\.fecap\.br\/parceiro\//);
      expect(partner.logo).toMatch(/^https:\/\/www\.fecap\.br\/wp-content\/uploads\//);
    }
    expect(fecapPartners.map((partner) => partner.name)).toContain('GENERAL MOTORS');
  });
});
