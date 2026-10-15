import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export type StubMode = 'ok' | 'slow' | 'incompatible' | 'error' | 'abstained' | 'human_validation' | 'invalid_schema';

export interface StubOptions {
  mode: StubMode;
  delayMs?: number;
}

export interface StubHandle {
  url: string;
  server: Server;
  requests: Array<{ headers: IncomingMessage['headers']; body: unknown }>;
  setMode(mode: StubMode): void;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: Buffer) => (data += chunk.toString()));
    req.on('end', () => resolve(data));
  });
}

function buildOkResponse(body: { request_id?: string; correlation_id?: string }, variant: StubMode) {
  const base = {
    contract_version: '1.0',
    request_id: body.request_id ?? 'req-stub',
    correlation_id: body.correlation_id ?? 'corr-stub',
    run_id: `run-stub-${Math.random().toString(36).slice(2, 10)}`,
    agent: 'student_agent',
    agent_version: '1.0.0-stub',
    config_version: '1.0.0',
    evaluated_at: new Date().toISOString(),
  };
  if (variant === 'abstained') {
    return {
      ...base,
      status: 'abstained',
      summary: 'Não foi possível gerar uma recomendação confiável.',
      recommendations: [],
      confidence: null,
      requires_human_validation: false,
      abstained: true,
      abstention_reason: 'Dados insuficientes para realizar uma análise confiável.',
    };
  }
  if (variant === 'human_validation') {
    return {
      ...base,
      status: 'recommendation',
      summary: 'Foi identificada uma situação que precisa de confirmação por uma pessoa responsável.',
      recommendations: [
        {
          id: `rec-stub-${Math.random().toString(36).slice(2, 10)}`,
          type: 'institutional_validation',
          message: 'A informação acadêmica disponível possui inconsistência e precisa ser confirmada.',
          evidence: [{ type: 'data_quality', description: 'Os dados apresentados possuem inconsistência.', source_reference: 'academic_context' }],
          next_action: 'Entre em contato com a coordenação para validação.',
          confidence: 0.75,
          requires_human_validation: true,
          priority: 1,
          subject_id: null,
        },
      ],
      confidence: 0.75,
      requires_human_validation: true,
      abstained: false,
      abstention_reason: null,
    };
  }
  return {
    ...base,
    status: 'recommendation',
    summary: 'Foi identificada uma situação que merece atenção.',
    recommendations: [
      {
        id: `rec-stub-${Math.random().toString(36).slice(2, 10)}`,
        type: 'pending_activity',
        message: 'Existe uma atividade pendente que merece sua atenção.',
        evidence: [{ type: 'pending_item', description: 'Foi identificada uma atividade pendente.', source_reference: 'pending_items#pending-demo-001' }],
        next_action: 'Consultar os detalhes da atividade.',
        confidence: 0.9,
        requires_human_validation: false,
        priority: 1,
        subject_id: 'subject-demo-002',
      },
    ],
    confidence: 0.9,
    requires_human_validation: false,
    abstained: false,
    abstention_reason: null,
  };
}

/** Servidor HTTP mínimo que imita o Agent Service em modos controlados. */
export function createStubAgentServer(options: StubOptions): { listen(port?: number): Promise<StubHandle> } {
  let mode = options.mode;
  const requests: StubHandle['requests'] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'agent-service-stub' }));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/internal/v1/student-agent/evaluate') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'rota inexistente' } }));
      return;
    }
    const raw = await readBody(req);
    let body: { request_id?: string; correlation_id?: string } = {};
    try {
      body = JSON.parse(raw);
    } catch {
      body = {};
    }
    requests.push({ headers: req.headers, body });

    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    switch (mode) {
      case 'slow':
        setTimeout(() => send(200, buildOkResponse(body, 'ok')), options.delayMs ?? 10_000);
        return;
      case 'incompatible':
        return send(200, { contract_version: '2.0', unexpected_field: true });
      case 'invalid_schema':
        return send(200, { ...buildOkResponse(body, 'ok'), recommendations: [{ id: 'rec-x' }] });
      case 'error':
        return send(500, { error: { code: 'AGENT_INTERNAL_ERROR', message: 'Falha interna simulada.' } });
      case 'abstained':
      case 'human_validation':
      case 'ok':
      default:
        return send(200, buildOkResponse(body, mode));
    }
  });

  return {
    listen(port = 0) {
      return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => {
          const address = server.address();
          const actualPort = typeof address === 'object' && address ? address.port : port;
          resolve({
            url: `http://127.0.0.1:${actualPort}`,
            server,
            requests,
            setMode: (next) => {
              mode = next;
            },
            close: () =>
              new Promise((done) => {
                server.closeAllConnections?.();
                server.close(() => done());
              }),
          });
        });
      });
    },
  };
}
