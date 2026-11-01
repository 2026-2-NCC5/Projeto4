import { describe, expect, it } from 'vitest';
import { calculateJobMatch, type CareerOpportunity, type CareerProfile } from '../../src/career/matching.js';

const profile: CareerProfile = {
  id: 'profile-1', course: 'Ciência da Computação', academicDataVerified: true, semester: 5, skills: ['JS', 'React', 'TypeScript'],
  interests: ['Desenvolvimento Web'], city: 'Carapicuíba', state: 'SP', modalities: ['hybrid','remote'],
  preferredRadiusKm: 15, availability: {}, personalizationEnabled: true,
};
const opportunity: CareerOpportunity = {
  id: 'job-1', title: 'Estágio em Desenvolvimento Web', companyName: 'Empresa de teste', professionalArea: 'Desenvolvimento Web',
  acceptedCourses: ['Computação'], minSemester: 3, maxSemester: null, requiredSkills: ['JavaScript','React'], desiredSkills: ['Git'],
  city: 'Barueri', state: 'SP', workMode: 'hybrid', workloadHours: null, stipendMin: null, stipendMax: null,
  publishedAt: null, expiresAt: null, lastVerifiedAt: '2026-10-31T12:00:00.000Z', canonicalUrl: 'https://jobs.example.test/posting/1',
  jobType: 'internship', description: '',
};

describe('ASA Match deterministic scoring', () => {
  it('recommends related courses, skills, region, modality and interest with an explanation', () => {
    const result = calculateJobMatch(profile, opportunity, new Date('2026-10-31T12:01:00.000Z'));
    expect(result.eligibility).toBe('eligible');
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.matchedSkills).toEqual(expect.arrayContaining(['JavaScript','React']));
    expect(result.missingSkills).toContain('Git');
    expect(result.reasons.some((reason) => reason.includes('JavaScript'))).toBe(true);
    expect(result.algorithmVersion).toBe('asa-match-v1');
  });

  it('marks explicit unmet academic requirements ineligible without treating missing data the same way', () => {
    const strictJob = { ...opportunity, acceptedCourses: ['Administração'], minSemester: 7 };
    expect(calculateJobMatch(profile, strictJob).eligibility).toBe('ineligible');
    const missing = calculateJobMatch({ ...profile, course: null, semester: null }, { ...opportunity, acceptedCourses: ['Computação'], minSemester: 3 });
    expect(missing.eligibility).toBe('unverified');
    expect(missing.warnings.join(' ')).toContain('não confirmada');
  });

  it('does not declare a mismatch as ineligibility when academic data is self-reported', () => {
    const result = calculateJobMatch({ ...profile, academicDataVerified: false }, { ...opportunity, acceptedCourses: ['Administração'] });
    expect(result.eligibility).toBe('unverified');
    expect(result.warnings.join(' ')).toContain('não foram verificados');
  });

  it('uses only known factors and exposes lower coverage when profile data is sparse', () => {
    const sparse = calculateJobMatch({ ...profile, skills: [], interests: [], city: null, state: null, modalities: [] }, { ...opportunity, acceptedCourses: [], minSemester: null });
    expect(sparse.confidence).toBeLessThan(1);
    expect(sparse.factors.locationMatch).toBeNull();
    expect(sparse.score).toBeGreaterThanOrEqual(0);
    expect(sparse.score).toBeLessThanOrEqual(100);
  });

  it('does not reward remote preference when location or modality data is absent', () => {
    const noPreference = calculateJobMatch({ ...profile, modalities: [], city: null, state: null }, { ...opportunity, acceptedCourses: [], minSemester: null, workMode: 'remote' });
    expect(noPreference.factors.locationMatch).toBeNull();
  });
});
