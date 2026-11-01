import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeAssistantResponse } from './testing/fixtures';
import { HermesAssistantDialog } from './HermesAssistantDialog';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';

function OpenDialog() {
  const [open, setOpen] = useState(true);
  return <HermesAssistantDialog open={open} onClose={() => setOpen(false)} />;
}

const routes = [{ path: '/', element: <OpenDialog /> }, { path: '/login', element: <p>Login</p> }];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HermesAssistantDialog', () => {
  it('permite conversa pública anônima e consulta apenas a base publicada', async () => {
    const answer = makeAssistantResponse({ intent: 'knowledge_question', display: { title: 'Acesso ao Moodle', message: 'Entre pelo Portal do Aluno.', items: [], recommendations: [] } });
    const { calls } = mockApi({ 'POST /api/assistant/public/message': () => ({ data: answer }) });
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: '/', session: makeSession(null) });
    expect(await screen.findByText('Olá! Como posso ajudar?')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Sua pergunta para o Hermes' }), 'Como acesso o Moodle?');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Acesso ao Moodle' })).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')?.path).toBe('/api/assistant/public/message');
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ inputType: 'text', text: 'Como acesso o Moodle?' });
  });

  it('pede login apenas quando a pergunta exige dados acadêmicos pessoais', async () => {
    const { calls } = mockApi({
      'POST /api/assistant/public/message': () => ({ status: 401, error: { code: 'UNAUTHORIZED', message: 'Entre no ASA Conecta.', reason: 'student_login_required' } }),
    });
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: '/', session: makeSession(null) });
    await user.type(await screen.findByRole('textbox', { name: 'Sua pergunta para o Hermes' }), 'Como está minha frequência?');
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Essa consulta exige sua sessão de estudante.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar no ASA Conecta' })).toHaveAttribute('href', '/login?next=%2Faluno%2Fassistente');
    expect(calls.some((call) => call.path === '/api/assistant/message')).toBe(false);
  });

  it('envia a pergunta falada como voz, mantém o contexto e permite ouvir a resposta', async () => {
    const answer = makeAssistantResponse({ display: { title: 'Olá!', message: 'Posso ajudar com sua vida acadêmica.', items: [], recommendations: [] }, speech: { text: 'Posso ajudar com sua vida acadêmica.' } });
    const { calls } = mockApi({ 'POST /api/assistant/message': () => ({ data: answer }) });
    const instances: MockRecognition[] = [];
    class MockRecognition {
      lang = '';
      interimResults = false;
      continuous = false;
      onresult: ((event: Event & { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
      onerror: ((event: Event & { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() { instances.push(this); }
      start() {}
      stop() { this.onend?.(); }
      abort() {}
    }
    vi.stubGlobal('SpeechRecognition', MockRecognition);
    const speech = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [{ lang: 'pt-BR', name: 'Brazilian Natural', default: true, localService: true, voiceURI: 'natural' }] };
    class MockUtterance {
      lang = '';
      rate = 1;
      pitch = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    vi.stubGlobal('speechSynthesis', speech);
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: '/', session: makeSession(makeMe('student')) });

    expect(await screen.findByRole('group', { name: 'Sugestões de perguntas para o Hey ASA' })).toHaveTextContent('Tenho atividade pendente?');
    await user.click(await screen.findByRole('button', { name: 'Falar com Hermes' }));
    const instance = instances[0];
    expect(instance).toBeDefined();
    instance!.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Como vejo minhas atividades?' } }] } as never);
    await user.click(screen.getByRole('button', { name: 'Encerrar gravação e enviar pergunta' }));

    expect(await screen.findByRole('heading', { name: 'Olá!' })).toBeInTheDocument();
    const request = calls.find((call) => call.method === 'POST' && call.path === '/api/assistant/message');
    expect(request?.body).toMatchObject({ inputType: 'voice', text: 'Como vejo minhas atividades?', currentScreen: 'assistant' });
    expect(request?.body).toHaveProperty('clientMetrics.speechRecognitionMs');
    expect(screen.getByRole('button', { name: 'Parar leitura da resposta' })).toBeInTheDocument();
    expect(speech.speak).toHaveBeenCalledWith(expect.objectContaining({ lang: 'pt-BR', rate: 0.96, text: 'Posso ajudar com sua vida acadêmica.' }));
  });
});
