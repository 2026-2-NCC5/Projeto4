/**
 * Stub do Agent Service para reproduzir cenários de falha (E2E-002/003/004).
 *
 *   AGENT_STUB_MODE=ok|slow|incompatible|error AGENT_STUB_PORT=8001 npm run agent:stub
 *
 *   ok           → resposta válida (contrato 1.0, recomendação pending_activity)
 *   slow         → atrasa AGENT_STUB_DELAY_MS (padrão 10000) antes de responder (timeout)
 *   incompatible → responde contract_version 2.0 (contrato incompatível)
 *   error        → responde 500 (falha de dependência)
 */
import { createStubAgentServer } from '../test/support/agentStubServer.js';

const mode = (process.env.AGENT_STUB_MODE ?? 'ok') as 'ok' | 'slow' | 'incompatible' | 'error';
const port = Number(process.env.AGENT_STUB_PORT ?? 8001);
const delayMs = Number(process.env.AGENT_STUB_DELAY_MS ?? 10_000);

createStubAgentServer({ mode, delayMs }).listen(port).then((stub) => {
  console.log(`agent stub (${mode}) ouvindo em ${stub.url}`);
});
