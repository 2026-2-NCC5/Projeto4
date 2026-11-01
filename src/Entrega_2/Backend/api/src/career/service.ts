import { createHash } from 'node:crypto';
import type { DbPool } from '../db/pool.js';
import { calculateJobMatch, type CareerOpportunity, type CareerProfile } from './matching.js';

type SourceType = 'greenhouse' | 'lever';
type Source = { id: string; name: string; connectorType: SourceType; boardSlug: string; enabled: boolean; authorizationStatus: string };
type JsonRecord = Record<string, unknown>;

const JOB_COLUMNS = `j.id::text as id,j.source_id::text as "sourceId",s.name as "sourceName",j.external_id as "externalId",
 j.canonical_url as "canonicalUrl",j.company_name as "companyName",j.title,j.description,j.job_type as "jobType",
 j.professional_area as "professionalArea",j.accepted_courses as "acceptedCourses",j.min_semester as "minSemester",
 j.max_semester as "maxSemester",j.required_skills as "requiredSkills",j.desired_skills as "desiredSkills",
 j.city,j.state,j.country,j.latitude,j.longitude,j.work_mode as "workMode",j.stipend_min as "stipendMin",
 j.stipend_max as "stipendMax",j.workload_hours as "workloadHours",j.published_at as "publishedAt",
 j.expires_at as "expiresAt",j.last_verified_at as "lastVerifiedAt",j.status,j.created_at as "createdAt"`;

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stripHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim().slice(0, 20_000);
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

function safeBoardPostingUrl(value: unknown, connector: SourceType): string | null {
  const safe = safeHttpUrl(value);
  if (!safe) return null;
  const host = new URL(safe).hostname.toLowerCase();
  const allowed = connector === 'lever' ? ['jobs.lever.co','jobs.eu.lever.co'] : ['boards.greenhouse.io','job-boards.greenhouse.io'];
  return allowed.includes(host) ? safe : null;
}

function guessType(title: string, text: string): string {
  const value = `${title} ${text}`.toLocaleLowerCase('pt-BR');
  if (/\b(est[aá]gio|intern(ship)?|interno)\b/.test(value)) return 'internship';
  if (/\b(trainee|trainee program)\b/.test(value)) return 'trainee';
  if (/\b(jovem aprendiz|apprentice)\b/.test(value)) return 'apprentice';
  if (/\b(programa de forma[cç][aã]o|graduate program)\b/.test(value)) return 'program';
  return 'employment';
}

function workMode(value: unknown, text: string): 'onsite' | 'hybrid' | 'remote' | 'unknown' {
  const term = `${typeof value === 'string' ? value : ''} ${text}`.toLocaleLowerCase('pt-BR');
  if (/\b(remoto|remote|home office)\b/.test(term)) return 'remote';
  if (/\b(h[ií]brido|hybrid)\b/.test(term)) return 'hybrid';
  if (/\b(presencial|on[- ]?site)\b/.test(term)) return 'onsite';
  return 'unknown';
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function slug(value: string): boolean { return /^[A-Za-z0-9_-]{1,100}$/.test(value); }

function normalizeRaw(source: Source, raw: JsonRecord): Omit<CareerOpportunity, 'id' | 'lastVerifiedAt'> & { externalId: string; professionalArea: string | null; acceptedCourses: string[]; minSemester: number | null; maxSemester: number | null; requiredSkills: string[]; desiredSkills: string[]; latitude: number | null; longitude: number | null; country: string; status: 'active' } | null {
  let externalId: string | null = null;
  let title: string | null = null;
  let link: string | null = null;
  let desc = '';
  let location = '';
  let commitment = '';
  let published: string | null = null;
  if (source.connectorType === 'greenhouse') {
    externalId = String(raw.id ?? '');
    title = typeof raw.title === 'string' ? raw.title : null;
    link = safeBoardPostingUrl(raw.absolute_url, source.connectorType);
    desc = stripHtml(raw.content);
    location = typeof asJsonObject(raw.location).name === 'string' ? String(asJsonObject(raw.location).name) : '';
    const depts = Array.isArray(raw.departments) ? raw.departments.map((d) => asJsonObject(d).name).filter(Boolean).join(' / ') : '';
    commitment = `${location} ${depts}`;
    published = isoDate(raw.updated_at);
  } else {
    externalId = String(raw.id ?? '');
    title = typeof raw.text === 'string' ? raw.text : typeof raw.title === 'string' ? raw.title : null;
    link = safeBoardPostingUrl(raw.hostedUrl ?? raw.applyUrl ?? raw.url, source.connectorType);
    desc = stripHtml(raw.descriptionPlain ?? raw.description ?? raw.openingPlain ?? '');
    const categories = asJsonObject(raw.categories);
    location = typeof categories.location === 'string' ? categories.location : '';
    commitment = typeof categories.commitment === 'string' ? categories.commitment : '';
    published = isoDate(raw.createdAt ?? raw.updatedAt);
  }
  if (!externalId || externalId.length > 300 || !title?.trim() || !link) return null;
  const combined = `${location} ${commitment}`;
  const cityState = combined.match(/([^,|]+)[,|\s]+([A-Z]{2})\b/);
  const mode = workMode(raw.workplaceType, `${combined} ${desc.slice(0, 1500)}`);
  const categories = asJsonObject(raw.categories);
  const areaValue = raw.department ?? raw.team ?? categories.team;
  const area = typeof areaValue === 'string' ? areaValue : null;
  const hash = createHash('sha256').update(`${source.id}:${externalId}`).digest('hex');
  return {
    externalId: hash,
    canonicalUrl: link,
    companyName: source.name,
    title: title.trim().slice(0, 300),
    description: desc,
    jobType: guessType(title, `${desc} ${commitment}`),
    professionalArea: area?.slice(0, 160) ?? null,
    acceptedCourses: [],
    minSemester: null,
    maxSemester: null,
    requiredSkills: [],
    desiredSkills: [],
    city: cityState?.[1]?.trim().slice(0, 120) ?? (location && !/[A-Z]{2}\b/.test(location) ? location.slice(0, 120) : null),
    state: cityState?.[2] ?? null,
    country: 'BR',
    latitude: null,
    longitude: null,
    workMode: mode,
    stipendMin: null,
    stipendMax: null,
    workloadHours: null,
    publishedAt: published,
    expiresAt: null,
    status: 'active',
  };
}

async function fetchBoard(source: Source): Promise<JsonRecord[]> {
  if (!slug(source.boardSlug)) throw new Error('invalid_board_slug');
  const endpoint = source.connectorType === 'lever'
    ? `https://api.lever.co/v0/postings/${encodeURIComponent(source.boardSlug)}?mode=json`
    : `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.boardSlug)}/jobs?content=true`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(endpoint, { headers: { accept: 'application/json', 'user-agent': 'ASA-Match/1.0 (+https://fecap.br/asa)' }, redirect: 'error', signal: controller.signal });
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1))); continue; }
        throw new Error(`source_http_${response.status}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 5_000_000) throw new Error('source_response_too_large');
      const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
      const rows = Array.isArray(payload) ? payload : Array.isArray(asJsonObject(payload).jobs) ? asJsonObject(payload).jobs as unknown[] : [];
      return rows.map(asJsonObject);
    } catch (error) {
      lastError = error;
      if (attempt < 2 && !(error instanceof Error && /^source_http_4/.test(error.message))) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      else throw error;
    } finally { clearTimeout(timeout); }
  }
  throw lastError ?? new Error('source_unavailable');
}

function mapJob(row: JsonRecord): CareerOpportunity {
  return {
    ...row,
    id: String(row.id), sourceId: String(row.sourceId), sourceName: String(row.sourceName), externalId: String(row.externalId),
    canonicalUrl: String(row.canonicalUrl), companyName: String(row.companyName), title: String(row.title), description: String(row.description ?? ''),
    jobType: String(row.jobType), professionalArea: typeof row.professionalArea === 'string' ? row.professionalArea : null,
    acceptedCourses: asStrings(row.acceptedCourses), minSemester: row.minSemester === null ? null : Number(row.minSemester), maxSemester: row.maxSemester === null ? null : Number(row.maxSemester),
    requiredSkills: asStrings(row.requiredSkills), desiredSkills: asStrings(row.desiredSkills), city: typeof row.city === 'string' ? row.city : null,
    state: typeof row.state === 'string' ? row.state.trim() : null, workMode: row.workMode as CareerOpportunity['workMode'],
    stipendMin: row.stipendMin === null ? null : Number(row.stipendMin), stipendMax: row.stipendMax === null ? null : Number(row.stipendMax),
    workloadHours: row.workloadHours === null ? null : Number(row.workloadHours), publishedAt: row.publishedAt ? new Date(String(row.publishedAt)).toISOString() : null,
    expiresAt: row.expiresAt ? new Date(String(row.expiresAt)).toISOString() : null, lastVerifiedAt: new Date(String(row.lastVerifiedAt)).toISOString(),
    latitude: row.latitude === null ? null : Number(row.latitude), longitude: row.longitude === null ? null : Number(row.longitude),
  } as CareerOpportunity;
}

export interface JobFilters { search?: string; type?: string; workMode?: string; city?: string; state?: string; limit?: number; offset?: number }

export class CareerMatchService {
  constructor(private readonly pool: DbPool, private readonly now: () => Date = () => new Date()) {}

  async profile(studentId: string, course?: string | null) {
    const { rows } = await this.pool.query('select id::text as id,course,academic_data_verified as "academicDataVerified",semester,career_objective as "careerObjective",first_internship as "firstInternship",skills,interests,city,state,region,preferred_radius_km as "preferredRadiusKm",modalities,availability,personalization_enabled as "personalizationEnabled",updated_at as "updatedAt" from career_profiles where student_id=$1', [studentId]);
    const row = rows[0] as Record<string, unknown> | undefined;
    return row ? this.mapProfile(row) : this.emptyProfile(course ?? null);
  }

  private emptyProfile(course: string | null): CareerProfile & Record<string, unknown> {
    return { id: null, course, academicDataVerified: false, semester: null, careerObjective: '', firstInternship: false, skills: [], interests: [], city: null, state: null, region: null, preferredRadiusKm: null, modalities: [], availability: {}, personalizationEnabled: true };
  }

  private mapProfile(row: Record<string, unknown>): CareerProfile & Record<string, unknown> {
    return { ...row, id: String(row.id), course: typeof row.course === 'string' ? row.course : null, academicDataVerified: row.academicDataVerified === true, semester: row.semester === null ? null : Number(row.semester), skills: asStrings(row.skills), interests: asStrings(row.interests), city: typeof row.city === 'string' ? row.city : null, state: typeof row.state === 'string' ? row.state.trim() : null, modalities: asStrings(row.modalities), preferredRadiusKm: row.preferredRadiusKm === null ? null : Number(row.preferredRadiusKm), availability: asJsonObject(row.availability), personalizationEnabled: row.personalizationEnabled !== false };
  }

  async updateProfile(studentId: string, input: JsonRecord, academicCourse: string | null) {
    const course = typeof input.course === 'string' && input.course.trim() ? input.course.trim().slice(0, 160) : academicCourse;
    const state = typeof input.state === 'string' ? input.state.trim().toUpperCase() : input.state ?? null;
    const result = await this.pool.query(
      `insert into career_profiles(student_id,course,semester,career_objective,first_internship,skills,interests,city,state,region,preferred_radius_km,modalities,availability,personalization_enabled)
       values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13::jsonb,$14)
       on conflict(student_id) do update set course=excluded.course,semester=excluded.semester,career_objective=excluded.career_objective,
       first_internship=excluded.first_internship,skills=excluded.skills,interests=excluded.interests,city=excluded.city,state=excluded.state,
       region=excluded.region,preferred_radius_km=excluded.preferred_radius_km,modalities=excluded.modalities,availability=excluded.availability,
       personalization_enabled=excluded.personalization_enabled returning id::text as id,course,academic_data_verified as "academicDataVerified",semester,career_objective as "careerObjective",
       first_internship as "firstInternship",skills,interests,city,state,region,preferred_radius_km as "preferredRadiusKm",modalities,
       availability,personalization_enabled as "personalizationEnabled",updated_at as "updatedAt"`,
      [studentId, course, input.semester ?? null, input.careerObjective ?? '', input.firstInternship === true, JSON.stringify(input.skills ?? []), JSON.stringify(input.interests ?? []), input.city ?? null, state, input.region ?? null, input.preferredRadiusKm ?? null, input.modalities ?? [], JSON.stringify(input.availability ?? {}), input.personalizationEnabled !== false],
    );
    return this.mapProfile(result.rows[0] as Record<string, unknown>);
  }

  async catalog(filters: JobFilters = {}) {
    const limit = Math.max(1, Math.min(50, filters.limit ?? 20));
    const offset = Math.max(0, filters.offset ?? 0);
    const { rows } = await this.pool.query(
      `select ${JOB_COLUMNS} from career_job_opportunities j join career_job_sources s on s.id=j.source_id
       where j.status='active' and j.last_verified_at > $1::timestamptz-interval '7 days' and (j.expires_at is null or j.expires_at > $1)
       and ($2::text is null or position(lower($2) in lower(j.title || ' ' || j.company_name || ' ' || j.description || ' ' || coalesce(j.professional_area,''))) > 0)
       and ($3::text is null or j.job_type=$3) and ($4::text is null or j.work_mode=$4)
       and ($5::text is null or lower(j.city)=lower($5)) and ($6::text is null or j.state=$6)
       order by j.published_at desc nulls last,j.last_verified_at desc limit $7 offset $8`,
      [this.now(), filters.search?.trim().slice(0, 120) || null, filters.type ?? null, filters.workMode ?? null, filters.city?.trim().slice(0, 120) || null, filters.state?.toUpperCase() ?? null, limit, offset],
    );
    return { items: (rows as Record<string, unknown>[]).map(mapJob), limit, offset };
  }

  async getJob(opportunityId: string) {
    const { rows } = await this.pool.query(`select ${JOB_COLUMNS} from career_job_opportunities j join career_job_sources s on s.id=j.source_id where j.id=$1`, [opportunityId]);
    return rows[0] ? mapJob(rows[0] as Record<string, unknown>) : null;
  }

  async recommendations(studentId: string, course: string | null) {
    const profile = await this.profile(studentId, course);
    const catalog = await this.catalog({ type: 'internship', limit: 50 });
    if (!profile.id || !profile.personalizationEnabled) return { profileReady: false, items: [], profile };
    const matches = catalog.items.map((job) => ({ job, match: calculateJobMatch(profile, job, this.now()) }))
      .sort((a, b) => Number(a.match.eligibility === 'ineligible') - Number(b.match.eligibility === 'ineligible') || b.match.score - a.match.score);
    for (const { job, match } of matches) {
      await this.pool.query(
        `insert into career_job_matches(profile_id,opportunity_id,match_score,confidence,eligibility,factors,explanation,algorithm_version,calculated_at)
         values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)
         on conflict(profile_id,opportunity_id) do update set match_score=excluded.match_score,confidence=excluded.confidence,eligibility=excluded.eligibility,factors=excluded.factors,explanation=excluded.explanation,algorithm_version=excluded.algorithm_version,calculated_at=excluded.calculated_at`,
        [profile.id, job.id, match.score, match.confidence, match.eligibility, JSON.stringify(match.factors), JSON.stringify({ reasons: match.reasons, warnings: match.warnings, matchedSkills: match.matchedSkills, missingSkills: match.missingSkills }), match.algorithmVersion, match.calculatedAt],
      );
    }
    return { profileReady: true, items: matches.map(({ job, match }) => ({ ...job, match })), profile };
  }

  async saved(userId: string) {
    const { rows } = await this.pool.query(`select ${JOB_COLUMNS},sv.created_at as "savedAt" from career_saved_opportunities sv join career_job_opportunities j on j.id=sv.opportunity_id join career_job_sources s on s.id=j.source_id where sv.user_id=$1 order by sv.created_at desc`, [userId]);
    return (rows as Record<string, unknown>[]).map((row) => ({ ...mapJob(row), savedAt: row.savedAt }));
  }

  async save(userId: string, opportunityId: string) {
    await this.pool.query('insert into career_saved_opportunities(user_id,opportunity_id) values($1,$2) on conflict do nothing', [userId, opportunityId]);
    return { saved: true };
  }

  async unsave(userId: string, opportunityId: string) {
    const result = await this.pool.query('delete from career_saved_opportunities where user_id=$1 and opportunity_id=$2', [userId, opportunityId]);
    return { deleted: (result.rowCount ?? 0) > 0 };
  }

  async feedback(userId: string, opportunityId: string, feedback: string) {
    const { rows } = await this.pool.query(
      `insert into career_job_feedback(user_id,opportunity_id,feedback,use_for_personalization) values($1,$2,$3,false)
       on conflict(user_id,opportunity_id) do update set feedback=excluded.feedback,updated_at=now()
       returning feedback,updated_at as "updatedAt"`, [userId, opportunityId, feedback],
    );
    return rows[0];
  }

  async applications(userId: string) {
    const { rows } = await this.pool.query(`select ${JOB_COLUMNS},a.id::text as "applicationId",a.application_status as "applicationStatus",a.status_source as "statusSource",a.applied_at as "appliedAt",a.updated_at as "updatedAt" from career_student_applications a join career_job_opportunities j on j.id=a.opportunity_id join career_job_sources s on s.id=j.source_id where a.user_id=$1 order by a.updated_at desc`, [userId]);
    return (rows as Record<string, unknown>[]).map((row) => ({ ...mapJob(row), applicationId: row.applicationId, applicationStatus: row.applicationStatus, statusSource: row.statusSource, appliedAt: row.appliedAt, updatedAt: row.updatedAt }));
  }

  async setApplication(userId: string, opportunityId: string, status: string) {
    const { rows } = await this.pool.query(
      `insert into career_student_applications(user_id,opportunity_id,application_status,status_source,applied_at)
       values($1,$2,$3,'student',case when $3='applied' then now() else null end)
       on conflict(user_id,opportunity_id) do update set application_status=excluded.application_status,status_source='student',
       applied_at=case when excluded.application_status='applied' then coalesce(career_student_applications.applied_at,now()) else career_student_applications.applied_at end
       returning id::text as id,application_status as status,status_source as "statusSource",applied_at as "appliedAt",updated_at as "updatedAt"`, [userId, opportunityId, status],
    );
    return rows[0];
  }

  async alerts(userId: string) {
    const { rows } = await this.pool.query('select enabled,minimum_match_score as "minimumMatchScore",frequency,channels,updated_at as "updatedAt" from career_job_alert_preferences where user_id=$1', [userId]);
    return rows[0] ?? { enabled: false, minimumMatchScore: 70, frequency: 'weekly', channels: [], updatedAt: null };
  }

  async updateAlerts(userId: string, input: JsonRecord) {
    const { rows } = await this.pool.query(
      `insert into career_job_alert_preferences(user_id,enabled,minimum_match_score,frequency,channels) values($1,$2,$3,$4,$5)
       on conflict(user_id) do update set enabled=excluded.enabled,minimum_match_score=excluded.minimum_match_score,frequency=excluded.frequency,channels=excluded.channels,updated_at=now()
       returning enabled,minimum_match_score as "minimumMatchScore",frequency,channels,updated_at as "updatedAt"`,
      [userId, input.enabled === true, input.minimumMatchScore ?? 70, input.frequency ?? 'weekly', input.channels ?? []],
    );
    return rows[0];
  }

  async notifications(userId: string) {
    const { rows } = await this.pool.query(
      `select n.id::text as "notificationId",n.created_at as "notifiedAt",n.read_at as "readAt",${JOB_COLUMNS}
       from career_notifications n join career_job_opportunities j on j.id=n.opportunity_id join career_job_sources s on s.id=j.source_id
       where n.user_id=$1 order by n.created_at desc limit 100`, [userId],
    );
    return (rows as Record<string, unknown>[]).map((row) => ({ ...mapJob(row), notificationId: row.notificationId, notifiedAt: row.notifiedAt, readAt: row.readAt }));
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const { rows } = await this.pool.query(`update career_notifications set read_at=coalesce(read_at,now()) where id=$1 and user_id=$2 returning id::text as id,read_at as "readAt"`, [notificationId, userId]);
    return rows[0] ?? null;
  }

  private async enqueueAlertsForJob(opportunityId: string) {
    const job = await this.getJob(opportunityId);
    if (!job) return;
    const { rows } = await this.pool.query(
      `select cp.id::text as id,cp.course,cp.academic_data_verified as "academicDataVerified",cp.semester,cp.skills,cp.interests,cp.city,cp.state,cp.modalities,cp.preferred_radius_km as "preferredRadiusKm",cp.availability,cp.personalization_enabled as "personalizationEnabled",a.user_id::text as "userId",a.minimum_match_score as "minimumMatchScore",a.frequency
       from career_profiles cp join students st on st.id=cp.student_id join career_job_alert_preferences a on a.user_id=st.user_id
       where cp.personalization_enabled=true and a.enabled=true and a.frequency<>'off' and 'in_app'=any(a.channels)`,
    );
    for (const row of rows as Record<string, unknown>[]) {
      const profile = this.mapProfile(row);
      const match = calculateJobMatch(profile, job, this.now());
      if (match.score < Number(row.minimumMatchScore) || match.eligibility === 'ineligible') continue;
      await this.pool.query(
        `insert into career_job_alert_outbox(user_id,opportunity_id,delivery_at)
         values($1,$2,case $3
           when 'immediate' then now()
           when 'daily' then (date_trunc('day',now() at time zone 'America/Sao_Paulo')+interval '1 day 9 hours') at time zone 'America/Sao_Paulo'
           when 'weekly' then (date_trunc('week',now() at time zone 'America/Sao_Paulo')+interval '1 week 9 hours') at time zone 'America/Sao_Paulo'
           else now() end) on conflict(user_id,opportunity_id) do nothing`,
        [row.userId, opportunityId, row.frequency],
      );
    }
  }

  async deliverDueAlerts(limit = 200) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query<{ id: string; userId: string; opportunityId: string }>(
        `select id::text as id,user_id::text as "userId",opportunity_id::text as "opportunityId" from career_job_alert_outbox
         where status='queued' and delivery_at<=now() order by delivery_at asc limit $1 for update skip locked`, [Math.max(1, Math.min(1000, limit))],
      );
      for (const row of rows) {
        await client.query(`insert into career_notifications(user_id,opportunity_id) values($1,$2) on conflict(user_id,opportunity_id) do nothing`, [row.userId, row.opportunityId]);
        await client.query(`update career_job_alert_outbox set status='delivered',delivered_at=now() where id=$1`, [row.id]);
      }
      await client.query('commit');
      return { delivered: rows.length };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  }

  async sources() {
    const { rows } = await this.pool.query(`select id::text as id,name,connector_type as "connectorType",board_slug as "boardSlug",authorization_status as "authorizationStatus",authorization_reference as "authorizationReference",enabled,sync_interval_minutes as "syncIntervalMinutes",health_status as "healthStatus",last_sync_at as "lastSyncAt",last_success_at as "lastSuccessAt",created_at as "createdAt" from career_job_sources order by created_at desc`);
    return rows;
  }

  async createSource(actorId: string, input: JsonRecord) {
    const { rows } = await this.pool.query(
      `insert into career_job_sources(name,connector_type,board_slug,authorization_status,authorization_reference,enabled,sync_interval_minutes,created_by)
       values($1,$2,$3,$4,$5,$6,$7,$8) returning id::text as id,name,connector_type as "connectorType",board_slug as "boardSlug",authorization_status as "authorizationStatus",authorization_reference as "authorizationReference",enabled,sync_interval_minutes as "syncIntervalMinutes",health_status as "healthStatus"`,
      [input.name, input.connectorType, input.boardSlug, input.authorizationStatus, input.authorizationReference ?? null, input.enabled === true && input.authorizationStatus === 'approved', input.syncIntervalMinutes ?? 360, actorId],
    );
    await this.audit(actorId, 'source.created', 'job_source', String(rows[0].id), { connectorType: input.connectorType });
    return rows[0];
  }

  async updateSource(actorId: string, sourceId: string, input: JsonRecord) {
    const { rows } = await this.pool.query(
      `update career_job_sources set authorization_status=coalesce($3,authorization_status),authorization_reference=coalesce($4,authorization_reference),
       enabled=case when $5::boolean is null then enabled else ($5::boolean and coalesce($3,authorization_status)='approved') end,
       sync_interval_minutes=coalesce($6,sync_interval_minutes),health_status=case when $5::boolean=false then 'paused' else health_status end
       where id=$1 and name=$2 returning id::text as id,name,connector_type as "connectorType",board_slug as "boardSlug",authorization_status as "authorizationStatus",authorization_reference as "authorizationReference",enabled,sync_interval_minutes as "syncIntervalMinutes",health_status as "healthStatus"`,
      [sourceId, input.name, input.authorizationStatus ?? null, input.authorizationReference ?? null, input.enabled ?? null, input.syncIntervalMinutes ?? null],
    );
    if (!rows[0]) return null;
    await this.audit(actorId, 'source.updated', 'job_source', sourceId, { enabled: rows[0].enabled, authorizationStatus: rows[0].authorizationStatus });
    return rows[0];
  }

  async collectionRuns(limit = 50) {
    const { rows } = await this.pool.query(`select r.id::text as id,r.source_id::text as "sourceId",s.name as "sourceName",r.started_at as "startedAt",r.finished_at as "finishedAt",r.status,r.total_fetched as "totalFetched",r.total_created as "totalCreated",r.total_updated as "totalUpdated",r.total_duplicates as "totalDuplicates",r.error_code as "errorCode",r.error_summary as "errorSummary" from career_job_collection_runs r join career_job_sources s on s.id=r.source_id order by r.started_at desc limit $1`, [Math.min(100, Math.max(1, limit))]);
    return rows;
  }

  async report() {
    const { rows } = await this.pool.query(`select count(*) filter(where status='active' and last_verified_at>now()-interval '7 days' and (expires_at is null or expires_at>now()))::int as "activeJobs",count(*) filter(where last_verified_at>now()-interval '24 hours')::int as "verifiedLastDay",count(*) filter(where status='expired' or expires_at<=now())::int as "expiredJobs",count(*) filter(where status='active' and last_verified_at<=now()-interval '7 days' and (expires_at is null or expires_at>now()))::int as "staleJobs",(select count(*)::int from career_job_sources) as "sources",(select count(*)::int from career_job_sources where enabled and health_status in ('failed','degraded')) as "unhealthySources" from career_job_opportunities`);
    return rows[0];
  }

  async enqueueEnabledSources() {
    const { rowCount } = await this.pool.query(
      `insert into career_job_collection_runs(source_id,status)
       select id,'queued' from career_job_sources where enabled=true and authorization_status='approved'
       on conflict do nothing`,
    );
    return { queued: rowCount ?? 0 };
  }

  async enqueueDueSources() {
    const { rowCount } = await this.pool.query(
      `insert into career_job_collection_runs(source_id,status)
       select id,'queued' from career_job_sources
       where enabled=true and authorization_status='approved'
       and (last_sync_at is null or last_sync_at < now()-(sync_interval_minutes * interval '1 minute'))
       on conflict do nothing`,
    );
    return { queued: rowCount ?? 0 };
  }

  async processCollectionQueue(limit = 5) {
    await this.pool.query(`update career_job_collection_runs set finished_at=now(),status='failed',error_code='worker_interrupted',error_summary='Ciclo interrompido; retentativa permitida.' where status='running' and started_at<now()-interval '30 minutes'`);
    const client = await this.pool.connect();
    let work: Array<{ runId: string; id: string; name: string; connectorType: SourceType; boardSlug: string; enabled: boolean; authorizationStatus: string }> = [];
    try {
      await client.query('begin');
      const claimed = await client.query<{ runId: string; id: string; name: string; connectorType: SourceType; boardSlug: string; enabled: boolean; authorizationStatus: string }>(
        `select r.id::text as "runId",s.id::text as id,s.name,s.connector_type as "connectorType",s.board_slug as "boardSlug",s.enabled,s.authorization_status as "authorizationStatus"
         from career_job_collection_runs r join career_job_sources s on s.id=r.source_id
         where r.status='queued' and s.enabled=true and s.authorization_status='approved'
         order by r.started_at asc limit $1 for update of r skip locked`, [Math.max(1, Math.min(10, limit))],
      );
      work = claimed.rows;
      if (work.length) await client.query(`update career_job_collection_runs set status='running',started_at=now() where id=any($1::uuid[])`, [work.map((item) => item.runId)]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }

    const summary = { sources: work.length, completed: 0, failed: 0, fetched: 0, created: 0, updated: 0 };
    for (const source of work) {
      let fetched = 0; let created = 0; let updated = 0;
      try {
        const rawJobs = await fetchBoard(source);
        fetched = rawJobs.length;
        for (const raw of rawJobs) {
          const job = normalizeRaw(source, raw);
          if (!job) continue;
          const result = await this.pool.query<{ id: string; inserted: boolean }>(
            `insert into career_job_opportunities(source_id,external_id,canonical_url,company_name,title,description,job_type,professional_area,accepted_courses,min_semester,max_semester,required_skills,desired_skills,city,state,country,latitude,longitude,work_mode,stipend_min,stipend_max,workload_hours,published_at,expires_at,last_verified_at,status)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,now(),$25)
             on conflict(source_id,external_id) do update set canonical_url=excluded.canonical_url,company_name=excluded.company_name,title=excluded.title,description=excluded.description,job_type=excluded.job_type,professional_area=excluded.professional_area,city=excluded.city,state=excluded.state,work_mode=excluded.work_mode,published_at=coalesce(excluded.published_at,career_job_opportunities.published_at),last_verified_at=now(),status=excluded.status
             returning id::text as id,(xmax=0) as inserted`,
            [source.id, job.externalId, job.canonicalUrl, job.companyName, job.title, job.description, job.jobType, job.professionalArea, JSON.stringify(job.acceptedCourses), job.minSemester, job.maxSemester, JSON.stringify(job.requiredSkills), JSON.stringify(job.desiredSkills), job.city, job.state, job.country, job.latitude, job.longitude, job.workMode, job.stipendMin, job.stipendMax, job.workloadHours, job.publishedAt, job.expiresAt, job.status],
          );
          if (result.rows[0]?.inserted) { created++; await this.enqueueAlertsForJob(result.rows[0].id); } else updated++;
        }
        await this.pool.query(`update career_job_collection_runs set finished_at=now(),status='completed',total_fetched=$2,total_created=$3,total_updated=$4,total_duplicates=$5 where id=$1`, [source.runId, fetched, created, updated, Math.max(0, updated - (fetched - created))]);
        await this.pool.query(`update career_job_sources set health_status='healthy',last_sync_at=now(),last_success_at=now() where id=$1`, [source.id]);
        summary.completed++;
      } catch (error) {
        const code = error instanceof Error ? error.message.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) : 'source_error';
        await this.pool.query(`update career_job_collection_runs set finished_at=now(),status='failed',total_fetched=$2,error_code=$3,error_summary='A fonte não respondeu ou retornou conteúdo inválido.' where id=$1`, [source.runId, fetched, code]);
        await this.pool.query(`update career_job_sources set health_status='failed',last_sync_at=now() where id=$1`, [source.id]);
        summary.failed++;
      }
      summary.fetched += fetched; summary.created += created; summary.updated += updated;
    }
    return summary;
  }

  private async audit(actorId: string, action: string, entityType: string, entityId: string, metadata: JsonRecord) {
    await this.pool.query('insert into career_audit_logs(actor_id,action,entity_type,entity_id,metadata) values($1,$2,$3,$4,$5::jsonb)', [actorId, action, entityType, entityId, JSON.stringify(metadata)]);
  }
}
