import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { agentRequestSchema, validateAgentResponse } from '../../src/contracts/agentContract.js';
import { ContractError } from '../../src/errors/AppError.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const examples = path.resolve(here, '../../../contracts/agent/examples');
const load = (name: string) => JSON.parse(readFileSync(path.join(examples, name), 'utf8'));

describe('teste de contrato Node ↔ Agent Service', () => {
  it('exemplo de requisição v1 é aceito pelo schema do consumidor', () => {
    expect(agentRequestSchema.safeParse(load('request.scenario-002.json')).success).toBe(true);
  });

  it('exemplo de resposta v1 é aceito e mantém os campos', () => {
    const parsed = validateAgentResponse(load('response.scenario-002.json'), 'req-demo-001');
    expect(parsed.status).toBe('recommendation');
    expect(parsed.recommendations[0]?.next_action).toBe('Consultar os detalhes da atividade.');
  });

  it('consumidor 1.x rejeita provider 2.0 com erro controlado', () => {
    expect(() => validateAgentResponse(load('response.incompatible-v2.json'))).toThrowError(ContractError);
    try {
      validateAgentResponse(load('response.incompatible-v2.json'));
    } catch (error) {
      expect((error as ContractError).status).toBe(502);
      expect((error as ContractError).code).toBe('CONTRACT_ERROR');
      expect((error as ContractError).message).toContain('2.0');
    }
  });

  it('versão 1.1 (minor compatível) é aceita; 0.9 e ausente são rejeitadas', () => {
    const ok = { ...load('response.scenario-002.json'), contract_version: '1.1' };
    expect(validateAgentResponse(ok).contract_version).toBe('1.1');
    expect(() => validateAgentResponse({ ...ok, contract_version: '0.9' })).toThrowError(ContractError);
    const { contract_version: _omit, ...missing } = ok;
    expect(() => validateAgentResponse(missing)).toThrowError(ContractError);
  });

  it('campos obrigatórios ausentes não são preenchidos com valores arbitrários', () => {
    const broken = { ...load('response.scenario-002.json') };
    delete broken.summary;
    expect(() => validateAgentResponse(broken)).toThrowError(ContractError);
    const noEvidence = { ...load('response.scenario-002.json') };
    noEvidence.recommendations = [{ ...noEvidence.recommendations[0], evidence: [] }];
    expect(() => validateAgentResponse(noEvidence)).toThrowError(ContractError);
  });

  it('request_id divergente é rejeitado', () => {
    expect(() => validateAgentResponse(load('response.scenario-002.json'), 'req-outra')).toThrowError(ContractError);
  });
});
