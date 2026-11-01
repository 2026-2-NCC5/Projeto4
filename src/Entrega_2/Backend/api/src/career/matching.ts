export const MATCH_ALGORITHM_VERSION = 'asa-match-v1';

export interface CareerProfile {
  id?: string | null;
  course: string | null;
  academicDataVerified?: boolean;
  semester: number | null;
  skills: string[];
  interests: string[];
  city: string | null;
  state: string | null;
  modalities: string[];
  preferredRadiusKm: number | null;
  availability: Record<string, unknown>;
  personalizationEnabled: boolean;
}

export interface CareerOpportunity {
  id: string;
  title: string;
  companyName: string;
  professionalArea: string | null;
  acceptedCourses: string[];
  minSemester: number | null;
  maxSemester: number | null;
  requiredSkills: string[];
  desiredSkills: string[];
  city: string | null;
  state: string | null;
  workMode: 'onsite' | 'hybrid' | 'remote' | 'unknown';
  workloadHours: number | null;
  stipendMin: number | null;
  stipendMax: number | null;
  publishedAt: string | null;
  expiresAt: string | null;
  lastVerifiedAt: string;
  canonicalUrl: string;
  jobType: string;
  description: string;
  sourceName?: string;
}

export interface JobMatchResult {
  opportunityId: string;
  score: number;
  confidence: number;
  eligibility: 'eligible' | 'ineligible' | 'unverified';
  factors: {
    academicMatch: number | null;
    skillMatch: number | null;
    locationMatch: number | null;
    availabilityMatch: number | null;
    interestMatch: number | null;
  };
  matchedSkills: string[];
  missingSkills: string[];
  reasons: string[];
  warnings: string[];
  algorithmVersion: string;
  calculatedAt: string;
}

const WEIGHTS = {
  academicMatch: 0.25,
  skillMatch: 0.25,
  locationMatch: 0.2,
  availabilityMatch: 0.15,
  interestMatch: 0.15,
} as const;

const SYNONYMS: Record<string, string[]> = {
  javascript: ['js', 'javascript'],
  typescript: ['ts', 'typescript'],
  react: ['react.js', 'reactjs', 'react'],
  'desenvolvimento web': ['web development', 'desenvolvimento web', 'frontend', 'front-end'],
  'engenharia de dados': ['data engineering', 'engenharia de dados'],
  'ciencia da computacao': ['ciência da computação', 'computer science', 'computação'],
  sql: ['sql', 'postgresql', 'mysql', 'bancos de dados relacionais'],
};

export function normalizeTerm(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9+#.]+/g, ' ').trim();
}

function related(left: string, right: string): boolean {
  const a = normalizeTerm(left);
  const b = normalizeTerm(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const group = Object.values(SYNONYMS).find((terms) => terms.some((term) => normalizeTerm(term) === a));
  return Boolean(group?.some((term) => normalizeTerm(term) === b));
}

function averageMatching(profileTerms: string[], requiredTerms: string[]): { score: number; matched: string[]; missing: string[] } | null {
  if (!requiredTerms.length) return null;
  if (!profileTerms.length) return { score: 0, matched: [], missing: [...requiredTerms] };
  const matched = requiredTerms.filter((need) => profileTerms.some((have) => related(have, need)));
  return { score: Math.round((matched.length / requiredTerms.length) * 100), matched, missing: requiredTerms.filter((need) => !matched.includes(need)) };
}

function interestScore(profile: CareerProfile, job: CareerOpportunity): number | null {
  if (!profile.interests.length) return null;
  const jobTerms = [job.professionalArea ?? '', job.title, ...job.requiredSkills, ...job.desiredSkills];
  const matched = profile.interests.filter((interest) => jobTerms.some((term) => related(interest, term)));
  return Math.round((matched.length / profile.interests.length) * 100);
}

function academicScore(profile: CareerProfile, job: CareerOpportunity): number | null {
  const checks: number[] = [];
  if (job.acceptedCourses.length && profile.course) {
    checks.push(job.acceptedCourses.some((course) => related(profile.course!, course)) ? 100 : 0);
  }
  if (job.minSemester !== null && profile.semester !== null) checks.push(profile.semester >= job.minSemester ? 100 : 0);
  if (job.maxSemester !== null && profile.semester !== null) checks.push(profile.semester <= job.maxSemester ? 100 : 0);
  return checks.length ? Math.round(checks.reduce((sum, score) => sum + score, 0) / checks.length) : null;
}

function locationScore(profile: CareerProfile, job: CareerOpportunity): number | null {
  if (job.workMode === 'remote') return profile.city || profile.state ? 100 : null;
  if (!profile.city && !profile.state) return null;
  if (!job.city && !job.state) return null;
  const cityMatches = profile.city && job.city && normalizeTerm(profile.city) === normalizeTerm(job.city);
  const stateMatches = profile.state && job.state && profile.state.toUpperCase() === job.state.toUpperCase();
  if (cityMatches && stateMatches) return 100;
  if (stateMatches && profile.preferredRadiusKm !== null) return null;
  if (stateMatches) return 65;
  return 0;
}

function availabilityScore(profile: CareerProfile, job: CareerOpportunity): number | null {
  const modal = profile.modalities.length > 0 && job.workMode !== 'unknown'
    ? (profile.modalities.includes(job.workMode) ? 100 : 0)
    : null;
  const maxHours = typeof profile.availability.maxWeeklyHours === 'number' ? profile.availability.maxWeeklyHours : null;
  const hours = job.workloadHours;
  const hoursScore = maxHours !== null && hours !== null ? (hours <= maxHours ? 100 : 0) : null;
  const known = [modal, hoursScore].filter((value): value is number => value !== null);
  return known.length ? Math.round(known.reduce((sum, score) => sum + score, 0) / known.length) : null;
}

export function calculateJobMatch(profile: CareerProfile, job: CareerOpportunity, now = new Date()): JobMatchResult {
  const allSkills = [...job.requiredSkills, ...job.desiredSkills];
  const skillResult = averageMatching(profile.skills, allSkills);
  const factors = {
    academicMatch: academicScore(profile, job),
    skillMatch: skillResult?.score ?? null,
    locationMatch: locationScore(profile, job),
    availabilityMatch: availabilityScore(profile, job),
    interestMatch: interestScore(profile, job),
  };
  const known = Object.entries(factors).filter(([, score]) => score !== null) as [keyof typeof WEIGHTS, number][];
  const usedWeight = known.reduce((sum, [key]) => sum + WEIGHTS[key], 0);
  const score = usedWeight
    ? Math.round(known.reduce((sum, [key, value]) => sum + value * WEIGHTS[key], 0) / usedWeight)
    : 0;

  const possibleCourseMismatch = job.acceptedCourses.length > 0 && profile.course !== null
    && !job.acceptedCourses.some((course) => related(profile.course!, course));
  const courseUnknown = job.acceptedCourses.length > 0 && profile.course === null;
  const possibleSemesterMismatch = (job.minSemester !== null && profile.semester !== null && profile.semester < job.minSemester)
    || (job.maxSemester !== null && profile.semester !== null && profile.semester > job.maxSemester);
  const semesterUnknown = (job.minSemester !== null || job.maxSemester !== null) && profile.semester === null;
  const academicSourceUnverified = (job.acceptedCourses.length > 0 || job.minSemester !== null || job.maxSemester !== null) && profile.academicDataVerified === false;
  const academicMismatchVerified = profile.academicDataVerified === true && (possibleCourseMismatch || possibleSemesterMismatch);
  const courseMismatch = profile.academicDataVerified === true && possibleCourseMismatch;
  const semesterMismatch = profile.academicDataVerified === true && possibleSemesterMismatch;
  const hasAcademicCriteria = job.acceptedCourses.length > 0 || job.minSemester !== null || job.maxSemester !== null;
  const eligibility = academicMismatchVerified ? 'ineligible' : !hasAcademicCriteria || courseUnknown || semesterUnknown || academicSourceUnverified || possibleCourseMismatch || possibleSemesterMismatch ? 'unverified' : 'eligible';
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (factors.academicMatch !== null && factors.academicMatch === 100) reasons.push('Curso e semestre atendem aos requisitos informados.');
  if (skillResult?.matched.length) reasons.push(`Competências relacionadas: ${skillResult.matched.join(', ')}.`);
  if (factors.locationMatch === 100) reasons.push('A região ou modalidade coincide com sua preferência.');
  if (factors.availabilityMatch === 100) reasons.push('Modalidade e disponibilidade informadas são compatíveis.');
  if (courseMismatch || semesterMismatch) warnings.push('Há incompatibilidade com um requisito acadêmico explícito da vaga.');
  else if (possibleCourseMismatch || possibleSemesterMismatch) warnings.push('Pode haver incompatibilidade acadêmica, mas os dados do estudante não foram verificados pela instituição.');
  if (courseUnknown || semesterUnknown || academicSourceUnverified) warnings.push('Elegibilidade acadêmica não confirmada por fonte institucional; revise os requisitos com a empresa.');
  if (!hasAcademicCriteria) warnings.push('A oportunidade não informa requisitos acadêmicos; elegibilidade não confirmada.');
  if (skillResult?.missing.length) warnings.push(`Competências não informadas no perfil: ${skillResult.missing.join(', ')}.`);
  if (factors.locationMatch === null) warnings.push('Localização insuficiente para comparar deslocamento.');
  if (factors.locationMatch === 65) warnings.push('A cidade da vaga difere; somente o estado coincide. Distância não calculada.');
  if (job.lastVerifiedAt && now.getTime() - new Date(job.lastVerifiedAt).getTime() > 7 * 86_400_000) warnings.push('A oportunidade não foi confirmada recentemente pela fonte.');
  if (!reasons.length) reasons.push('A recomendação usa somente os dados disponíveis; complete seu perfil para melhorar a comparação.');

  return {
    opportunityId: job.id,
    score,
    confidence: Number(usedWeight.toFixed(3)),
    eligibility,
    factors,
    matchedSkills: skillResult?.matched ?? [],
    missingSkills: skillResult?.missing ?? [],
    reasons,
    warnings,
    algorithmVersion: MATCH_ALGORITHM_VERSION,
    calculatedAt: now.toISOString(),
  };
}
