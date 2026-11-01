import { DependencyError } from '../errors/AppError.js';

export interface GamefyProgram {
  code: string;
  name: string;
}

export interface GamefyCourse {
  id: string;
  code: string;
  name: string;
  totalSemesters: number;
  periods: string[];
}

export interface GamefySubject {
  id: string;
  courseId: string;
  name: string;
  semester: number | null;
}

export interface GamefyAcademicCatalog {
  source: 'GameFY';
  institution: string;
  updatedAt: string;
  courses: GamefyCourse[];
  subjects: GamefySubject[];
  terms: Array<{ id: string; year: number; term: number; title: string; startsAt: string | null; endsAt: string | null; current: boolean }>;
  classes: Array<{ id: string; courseId: string; semester: number; period: string; classCode: string }>;
}

export interface GamefyDirectoryPerson {
  id: string;
  name: string;
  course?: string;
  semester?: number | null;
  period?: string | null;
  classCode?: string | null;
  department?: string | null;
}

type GamefyConfig = { url: string | null; serviceRoleKey: string | null; institutionSlug: string };
type Row = Record<string, unknown>;

/** Adaptador read-only do catálogo acadêmico e diretório do GameFY. A chave privilegiada só vive no servidor. */
export class GamefyDirectory {
  private institutionId: string | null = null;
  private institutionLookupAt = 0;
  private catalogCache: { expiresAt: number; value: GamefyAcademicCatalog } | null = null;

  constructor(private readonly config: GamefyConfig, private readonly now: () => Date = () => new Date()) {}

  get enabled(): boolean {
    return Boolean(this.config.url && this.config.serviceRoleKey);
  }

  async programs(): Promise<GamefyProgram[]> {
    const catalog = await this.catalog();
    return catalog.courses.map(({ code, name }) => ({ code, name }));
  }

  async program(code: string): Promise<GamefyProgram | null> {
    const normalized = code.trim().toUpperCase();
    return (await this.programs()).find((item) => item.code.toUpperCase() === normalized) ?? null;
  }

  async catalog(): Promise<GamefyAcademicCatalog> {
    this.credentials();
    if (this.catalogCache && this.catalogCache.expiresAt > this.now().getTime()) return this.catalogCache.value;
    const institutionId = await this.getInstitutionId();
    const [courseRows, subjectRows, termRows, classRows] = await Promise.all([
      this.rows('courses', { select: 'id,code,name,total_semesters,available_periods', deleted_at: 'is.null', order: 'name.asc', limit: '100' }),
      this.rows('subjects', { select: 'id,course_id,name,semester', deleted_at: 'is.null', order: 'name.asc', limit: '500' }),
      this.rows('academic_terms', { select: 'id,year,term,title,starts_at,ends_at,is_current', institution_id: `eq.${institutionId}`, is_active: 'eq.true', deleted_at: 'is.null', order: 'year.desc,term.desc', limit: '50' }),
      this.rows('course_semester_turmas', { select: 'id,course_id,semester,period,turma', institution_id: `eq.${institutionId}`, is_active: 'eq.true', order: 'course_id.asc,semester.asc,period.asc,turma.asc', limit: '500' }),
    ]);
    const courses = courseRows.map((row) => ({
      id: String(row.id), code: String(row.code), name: String(row.name),
      totalSemesters: Number(row.total_semesters) || 0,
      periods: Array.isArray(row.available_periods) ? row.available_periods.filter((value): value is string => typeof value === 'string') : [],
    }));
    const knownCourses = new Set(courses.map((course) => course.id));
    const value: GamefyAcademicCatalog = {
      source: 'GameFY', institution: this.config.institutionSlug.toUpperCase(), updatedAt: this.now().toISOString(),
      courses,
      subjects: subjectRows.filter((row) => knownCourses.has(String(row.course_id))).map((row) => ({ id: String(row.id), courseId: String(row.course_id), name: String(row.name), semester: row.semester === null ? null : Number(row.semester) })),
      terms: termRows.map((row) => ({ id: String(row.id), year: Number(row.year), term: Number(row.term), title: String(row.title), startsAt: typeof row.starts_at === 'string' ? row.starts_at : null, endsAt: typeof row.ends_at === 'string' ? row.ends_at : null, current: row.is_current === true })),
      classes: classRows.filter((row) => knownCourses.has(String(row.course_id))).map((row) => ({ id: String(row.id), courseId: String(row.course_id), semester: Number(row.semester), period: String(row.period), classCode: String(row.turma) })),
    };
    this.catalogCache = { expiresAt: this.now().getTime() + 5 * 60_000, value };
    return value;
  }

  async searchPeople(kind: 'student' | 'professor', query: string): Promise<GamefyDirectoryPerson[]> {
    this.credentials();
    const q = query.trim().replace(/[%_*(),]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
    if (q.length < 2) return [];
    const institutionId = await this.getInstitutionId();
    const escaped = `*${q}*`;
    const role = kind === 'student' ? 'student' : 'professor';
    const userRows = await this.rows('users', { select: 'id,name', role: `eq.${role}`, is_active: 'eq.true', deleted_at: 'is.null', name: `ilike.${escaped}`, order: 'name.asc', limit: '30' });
    const usersById = new Map(userRows.map((row) => [String(row.id), String(row.name ?? '')]));
    const userIds = [...usersById.keys()];
    if (kind === 'professor') {
      if (!userIds.length) return [];
      const professorRows = await this.rows('professors', { select: 'id,user_id,department', institution_id: `eq.${institutionId}`, is_active: 'eq.true', deleted_at: 'is.null', user_id: `in.(${userIds.join(',')})`, limit: '20' });
      return professorRows.map((row) => ({ id: String(row.id), name: usersById.get(String(row.user_id)) ?? '', department: typeof row.department === 'string' ? row.department : null })).filter((person) => person.name);
    }

    const byName = userIds.length
      ? await this.rows('students', { select: 'id,user_id,ra,course_name,current_semester,period,class_code', institution_id: `eq.${institutionId}`, is_active: 'eq.true', deleted_at: 'is.null', user_id: `in.(${userIds.join(',')})`, limit: '20' })
      : [];
    // RA pode ser usado para localizar uma pessoa, mas é removido da resposta do diretório.
    const byRegistration = await this.rows('students', { select: 'id,user_id,ra,course_name,current_semester,period,class_code', institution_id: `eq.${institutionId}`, is_active: 'eq.true', deleted_at: 'is.null', ra: `ilike.${escaped}`, limit: '20' });
    const people = new Map<string, Row>();
    for (const row of [...byName, ...byRegistration]) people.set(String(row.id), row);
    const missingIds = [...new Set([...people.values()].map((row) => String(row.user_id)))].filter((id) => !usersById.has(id));
    if (missingIds.length) {
      const extraUsers = await this.rows('users', { select: 'id,name', role: 'eq.student', is_active: 'eq.true', deleted_at: 'is.null', id: `in.(${missingIds.join(',')})`, limit: '30' });
      for (const row of extraUsers) usersById.set(String(row.id), String(row.name ?? ''));
    }
    return [...people.values()].map((row) => ({
      id: String(row.id), name: usersById.get(String(row.user_id)) ?? '',
      course: typeof row.course_name === 'string' ? row.course_name : undefined,
      semester: row.current_semester === null ? null : Number(row.current_semester),
      period: typeof row.period === 'string' ? row.period : null,
      classCode: typeof row.class_code === 'string' ? row.class_code : null,
    })).filter((person) => person.name).slice(0, 20);
  }

  private credentials(): { url: string; serviceRoleKey: string } {
    if (!this.config.url || !this.config.serviceRoleKey) throw new DependencyError('A integração de dados acadêmicos do GameFY não está configurada.', undefined, 'gamefy_not_configured');
    return { url: this.config.url, serviceRoleKey: this.config.serviceRoleKey };
  }

  private async getInstitutionId(): Promise<string> {
    if (this.institutionId && this.institutionLookupAt > this.now().getTime()) return this.institutionId;
    const rows = await this.rows('institutions', { select: 'id', slug: `eq.${this.config.institutionSlug}`, limit: '1' });
    const id = rows[0]?.id;
    if (typeof id !== 'string') throw new DependencyError('A instituição FECAP não foi localizada na fonte acadêmica do GameFY.', undefined, 'gamefy_institution_missing');
    this.institutionId = id;
    this.institutionLookupAt = this.now().getTime() + 24 * 60 * 60_000;
    return id;
  }

  private async rows(table: string, query: Record<string, string>): Promise<Row[]> {
    const { url: baseUrl, serviceRoleKey } = this.credentials();
    const allowed = new Set(['institutions', 'courses', 'subjects', 'academic_terms', 'course_semester_turmas', 'students', 'users', 'professors']);
    if (!allowed.has(table)) throw new Error('Tabela não permitida no conector acadêmico.');
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await fetch(url, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }, signal: AbortSignal.timeout(8_000) });
    } catch (error) {
      throw new DependencyError('Não foi possível consultar o diretório acadêmico do GameFY.', error, 'gamefy_unavailable');
    }
    if (!response.ok) throw new DependencyError('A fonte acadêmica do GameFY retornou uma falha de consulta.', undefined, 'gamefy_query_failed');
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new DependencyError('A fonte acadêmica do GameFY retornou um formato inesperado.', undefined, 'gamefy_invalid_response');
    return payload.filter((item): item is Row => typeof item === 'object' && item !== null && !Array.isArray(item));
  }
}
