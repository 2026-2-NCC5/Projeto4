import { createHash, randomUUID } from 'node:crypto';
import type { DbPool } from '../db/pool.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

export type InternshipData = Record<string, unknown>;
export interface ValidationIssue { field: string; message: string }
const obj = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export function validateInternship(data: InternshipData, omittedFields: string[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const student = obj(data.student);
  const address = obj(student.address);
  const company = obj(data.company);
  const contract = obj(data.contract);
  const required: Array<[string, string]> = [
    ['student.fullName', str(student.fullName)], ['student.email', str(student.email)],
    ['student.address.zipCode', str(address.zipCode)], ['student.address.state', str(address.state)],
    ['student.address.city', str(address.city)], ['student.address.neighborhood', str(address.neighborhood)],
    ['student.address.street', str(address.street)], ['student.address.number', str(address.number) || (address.noNumber === true ? 'SEM NÚMERO' : '')],
    ['company.legalName', str(company.legalName)], ['company.cnpj', str(company.cnpj)],
    ['contract.startDate', str(contract.startDate)], ['contract.endDate', str(contract.endDate)],
    ['contract.activities', str(contract.activities)],
  ];
  for (const [field, value] of required) {
    if (!value) issues.push({ field, message: `Campo obrigatório ausente: ${field}.` });
    else if (omittedFields.includes(field)) issues.push({ field, message: `${field} não foi encontrado no documento preparado. Revise os dados antes de continuar.` });
  }
  if (str(address.zipCode) && !/^\d{5}-?\d{3}$/.test(str(address.zipCode))) issues.push({ field: 'student.address.zipCode', message: 'Informe um CEP válido com 8 dígitos.' });
  if (str(contract.startDate) && str(contract.endDate) && str(contract.endDate) < str(contract.startDate)) issues.push({ field: 'contract.endDate', message: 'A data de término deve ser posterior à data de início.' });
  return issues;
}

export class InternshipService {
  constructor(private readonly pool: DbPool, private readonly dataMode: string) {}

  async list(studentId: string) {
    const { rows } = await this.pool.query('select id, request_type as "requestType", status, version, data, is_demo as "isDemo", created_at as "createdAt", updated_at as "updatedAt" from internships where student_id=$1 order by updated_at desc', [studentId]);
    return rows;
  }

  async get(studentId: string, id: string) {
    const { rows } = await this.pool.query('select id, request_type as "requestType", status, version, data, is_demo as "isDemo", created_at as "createdAt", updated_at as "updatedAt" from internships where student_id=$1 and id=$2', [studentId, id]);
    if (!rows[0]) throw new NotFoundError('Solicitação de estágio não encontrada.');
    return rows[0];
  }

  async create(studentId: string, actorId: string, requestType: string, data: InternshipData, clientRequestId: string) {
    const prior = await this.pool.query('select id from internships where student_id=$1 and client_request_id=$2', [studentId, clientRequestId]);
    if (prior.rows[0]) return this.get(studentId, String(prior.rows[0].id));
    const id = randomUUID();
    const payload = { ...data };
    const demo = this.dataMode === 'demo';
    try {
      await this.pool.query('insert into internships(id,student_id,client_request_id,request_type,data,is_demo) values($1,$2,$3,$4,$5,$6)', [id, studentId, clientRequestId, requestType, payload, demo]);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        const raced = await this.pool.query('select id from internships where student_id=$1 and client_request_id=$2', [studentId, clientRequestId]);
        if (raced.rows[0]) return this.get(studentId, String(raced.rows[0].id));
      }
      throw error;
    }
    await this.event(id, actorId, 'draft_created', { requestType });
    return this.get(studentId, id);
  }

  async update(studentId: string, actorId: string, id: string, data: InternshipData) {
    const existing = await this.get(studentId, id) as { data: InternshipData; status: string; version: number };
    if (existing.status === 'completed') throw new ValidationError('Um processo concluído não pode ser alterado.');
    const merged = { ...existing.data, ...data };
    await this.pool.query('update internships set data=$3,version=version+1 where student_id=$1 and id=$2', [studentId, id, merged]);
    await this.event(id, actorId, 'draft_updated', { version: existing.version + 1 });
    return this.get(studentId, id);
  }

  async validate(studentId: string, id: string) {
    const record = await this.get(studentId, id) as { data: InternshipData };
    return { valid: validateInternship(record.data).length === 0, issues: validateInternship(record.data) };
  }

  async generate(studentId: string, actorId: string, id: string, omitFields: string[]) {
    const record = await this.get(studentId, id) as { data: InternshipData; isDemo?: boolean };
    if (omitFields.length > 0 && !record.isDemo) throw new ValidationError('A simulação de falha de template está disponível somente em processos de demonstração.');
    const issues = validateInternship(record.data, omitFields);
    const fields = this.templateFields(record.data, omitFields);
    const snapshot = structuredClone(record.data);
    const hash = createHash('sha256').update(JSON.stringify({ snapshot, fields, templateVersion: 1 })).digest('hex');
    const { rows } = await this.pool.query('select coalesce(max(version),0)+1 as version from internship_documents where internship_id=$1', [id]);
    const version = Number(rows[0]?.version ?? 1);
    const doc = await this.pool.query('insert into internship_documents(internship_id,version,template_key,template_version,source_snapshot,rendered_fields,content_hash,validation_status) values($1,$2,$3,1,$4,$5,$6,$7) returning id,version,content_hash as "contentHash",validation_status as "validationStatus",created_at as "createdAt"', [id, version, 'internship-commitment-demo', snapshot, fields, hash, issues.length ? 'invalid' : 'valid']);
    await this.event(id, actorId, 'document_generated', { documentId: doc.rows[0]?.id, version, validationStatus: issues.length ? 'invalid' : 'valid', issues });
    await this.pool.query('update internships set status=$2 where id=$1', [id, issues.length ? 'needs_correction' : 'document']);
    return { document: doc.rows[0], fields, issues, preview: this.preview(fields), signatureProvider: 'manual_assisted', officialDocument: false };
  }

  async documents(studentId: string, id: string) {
    await this.get(studentId, id);
    const { rows } = await this.pool.query('select id,version,template_key as "templateKey",template_version as "templateVersion",rendered_fields as fields,content_hash as "contentHash",validation_status as "validationStatus",created_at as "createdAt" from internship_documents where internship_id=$1 order by version desc', [id]);
    return rows;
  }

  async submit(studentId: string, actorId: string, id: string) {
    await this.get(studentId, id);
    const { rows } = await this.pool.query('select validation_status from internship_documents where internship_id=$1 order by version desc limit 1', [id]);
    if (rows[0]?.validation_status !== 'valid') throw new ValidationError('Envio bloqueado: gere e aprove uma versão documental válida antes de prosseguir.');
    await this.pool.query("update internships set status='signatures' where student_id=$1 and id=$2", [studentId, id]);
    await this.event(id, actorId, 'manual_signature_preparation', { provider: 'manual_assisted', officialTransmission: false });
    return { status: 'signatures', provider: 'manual_assisted', officialTransmission: false, message: 'Documento preparado para encaminhamento manual. Nenhuma assinatura foi enviada.' };
  }

  async appeal(studentId: string, actorId: string, id: string, reason: string) {
    await this.get(studentId, id);
    const { rows } = await this.pool.query('insert into internship_appeals(internship_id,student_id,reason) values($1,$2,$3) returning id,status,created_at as "createdAt"', [id, studentId, reason]);
    await this.event(id, actorId, 'appeal_opened', { appealId: rows[0]?.id });
    return rows[0];
  }

  private async event(id: string, actorId: string, type: string, detail: Record<string, unknown>) {
    await this.pool.query('insert into internship_events(internship_id,actor_user_id,event_type,detail) values($1,$2,$3,$4)', [id, actorId, type, detail]);
  }

  private templateFields(data: InternshipData, omitted: string[]) {
    const student = obj(data.student), address = obj(student.address), company = obj(data.company), contract = obj(data.contract);
    const fields: Record<string, string> = {
      'student.fullName': str(student.fullName), 'student.email': str(student.email),
      'student.address.zipCode': str(address.zipCode), 'student.address.state': str(address.state),
      'student.address.city': str(address.city), 'student.address.neighborhood': str(address.neighborhood),
      'student.address.street': str(address.street), 'student.address.number': str(address.number) || (address.noNumber === true ? 'Sem número' : ''),
      'student.address.complement': str(address.complement), 'company.legalName': str(company.legalName), 'company.cnpj': str(company.cnpj),
      'contract.startDate': str(contract.startDate), 'contract.endDate': str(contract.endDate), 'contract.activities': str(contract.activities),
    };
    for (const field of omitted) delete fields[field];
    return fields;
  }

  private preview(fields: Record<string, string>) {
    return ['TERMO DE COMPROMISSO DE ESTÁGIO — PRÉVIA DE DEMONSTRAÇÃO', '', ...Object.entries(fields).map(([key, value]) => `${key}: ${value || '—'}`), '', 'Modelo demonstrativo não oficial. Não enviado para assinatura.'].join('\n');
  }
}
