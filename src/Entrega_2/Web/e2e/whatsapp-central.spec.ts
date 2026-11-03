import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ACCOUNTS, authFile, bearer, mobileLogin } from './support/accounts';

/**
 * Cenário-alvo da Central de Atendimento, ponta a ponta, contra a API e o PostgreSQL reais, com o provedor fake:
 * nada sai para o WhatsApp e só números sintéticos (+999) existem. O "app do estudante" é a mesma API usada pelo Expo.
 * Com E2E_EVIDENCE_DIR definido, grava capturas (só dados fictícios).
 */
const EVIDENCE = process.env.E2E_EVIDENCE_DIR ?? '';
const evidence = async (page: Page, name: string) => {
  if (!EVIDENCE) return;
  mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`) });
};

const unique = () => Date.now().toString().slice(-8);
const contactNumber = () => `+999${unique()}${Math.floor(Math.random() * 90 + 10)}`;

async function adminToken(request: APIRequestContext) {
  return (await mobileLogin(request, ACCOUNTS.admin.email)).token;
}

async function demoChannel(request: APIRequestContext, token: string): Promise<string | null> {
  const list = await request.get('/api/admin/support/channels', { headers: bearer(token) });
  if (list.status() !== 200) return null;
  const body = (await list.json()) as { data: { provider: string | null; items: Array<{ id: string; provider: string }> } };
  if (body.data.provider !== 'fake') return null;
  return body.data.items.find((item) => item.provider === 'fake')?.id ?? null;
}

async function setConnection(request: APIRequestContext, token: string, channelId: string, status: string) {
  const response = await request.post('/api/admin/support/simulator/connection', { headers: bearer(token), data: { channelId, status } });
  expect(response.status()).toBe(200);
}

test.describe('Central de Atendimento WhatsApp', () => {
  test('do WhatsApp ao app do estudante, sem sair da tela', async ({ browser, request }) => {
    test.setTimeout(120_000);
    const admin = await adminToken(request);
    const channelId = await demoChannel(request, admin);
    test.skip(!channelId, 'requer ASA_WHATSAPP_PROVIDER=fake na API');
    await setConnection(request, admin, channelId!, 'CONNECTED');

    // 1. Mensagem chega pelo WhatsApp, de um contato sem vínculo
    const from = contactNumber();
    const last4 = from.slice(-4);
    const eventId = `e2e-${unique()}`;
    const inbound = await request.post('/api/admin/support/simulator/inbound', { headers: bearer(admin), data: { channelId, from, name: 'Pessoa de teste', text: 'Olá, preciso do meu comprovante de matrícula.', providerEventId: eventId } });
    expect(inbound.status()).toBe(200);
    // o mesmo evento repetido não duplica nada
    const duplicate = await request.post('/api/admin/support/simulator/inbound', { headers: bearer(admin), data: { channelId, from, text: 'Olá, preciso do meu comprovante de matrícula.', providerEventId: eventId } });
    expect(((await duplicate.json()) as { data: { duplicates: number } }).data.duplicates).toBe(1);
    await request.post('/api/admin/support/simulator/inbound', { headers: bearer(admin), data: { channelId, from, kind: 'document', text: 'Segue meu documento' } });

    // 2. Atendente vê na fila de não identificados, com o estado real do canal e a marca de demonstração
    const staffContext = await browser.newContext({ storageState: authFile('staff'), viewport: { width: 1440, height: 900 } });
    const staff = await staffContext.newPage();
    const consoleErrors: string[] = [];
    staff.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    staff.on('pageerror', (error) => consoleErrors.push(String(error)));
    await staff.goto('/asa/atendimento?fila=unidentified');
    await expect(staff.getByRole('heading', { name: 'Central de Atendimento' })).toBeVisible();
    await expect(staff.getByText('WhatsApp: Conectado')).toBeVisible();
    await expect(staff.getByText('Modo de demonstração', { exact: true })).toBeVisible();
    await expect(staff.getByText('Atualizando ao vivo')).toBeVisible();
    await expect(staff.getByRole('region', { name: 'Caixa de entrada' })).toBeVisible();
    await expect(staff.getByRole('region', { name: 'Conversa' })).toBeVisible();
    await expect(staff.getByRole('region', { name: 'Contexto do atendimento' })).toBeVisible();

    // 3. Abre a conversa: o número nunca aparece inteiro, e não há dados acadêmicos de quem não foi identificado
    const row = staff.getByRole('button', { name: new RegExp(`${last4}`) }).first();
    await row.click();
    const conversation = staff.getByRole('region', { name: 'Conversa' });
    await expect(conversation.getByText('Olá, preciso do meu comprovante de matrícula.')).toBeVisible();
    await expect(staff.locator('body')).not.toContainText(from);
    await expect(conversation.getByText('Sem vínculo verificado')).toBeVisible();
    const ticketId = decodeURIComponent(new URL(staff.url()).pathname.split('/').pop()!);
    await evidence(staff, '01-central-tres-paineis');

    const context = staff.getByRole('region', { name: 'Contexto do atendimento' });
    await context.getByRole('tab', { name: 'Acadêmico' }).click();
    await expect(context.getByText(/Indisponível\./)).toBeVisible();

    // 4. Documento abre na própria tela (PDF desenhado em canvas), com o chat disponível ao lado
    await context.getByRole('tab', { name: /Documentos/ }).click();
    await context.getByRole('button', { name: 'Visualizar' }).click();
    await expect(staff.getByRole('img', { name: /Página 1 de documento-demonstracao\.pdf/ })).toBeVisible({ timeout: 20_000 });
    await evidence(staff, '02-previa-pdf-com-chat-aberto');
    await expect(staff.getByRole('button', { name: 'Fechar a prévia' })).toBeVisible();

    // 5. Responde com o documento ainda aberto: a mensagem sai da fila com confirmação do provedor, nunca "entregue" antes
    await staff.getByLabel('Resposta pelo WhatsApp').fill('Recebi seu documento e já estou conferindo.');
    await staff.getByRole('button', { name: 'Enviar pelo WhatsApp' }).click();
    await expect(conversation.getByText('Recebi seu documento e já estou conferindo.')).toBeVisible();
    await expect(conversation.getByText('Enviada', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(conversation.getByText('Entregue', { exact: true })).toHaveCount(0);
    await request.post('/api/admin/support/simulator/delivery', { headers: bearer(admin), data: { channelId, state: 'delivered' } });
    await expect(conversation.getByText('Entregue', { exact: true })).toBeVisible({ timeout: 15_000 });
    await evidence(staff, '03-resposta-entregue');
    await staff.getByRole('button', { name: 'Fechar a prévia' }).click();

    // 6. Estudante vincula o WhatsApp pelo app: prova enviando o código pelo próprio número e confirma
    const student = await mobileLogin(request, ACCOUNTS.student.email);
    const state = (await (await request.get('/api/support/me/whatsapp', { headers: bearer(student.token) })).json()) as { data: { consentVersion: string; links: Array<{ id: string }> } };
    for (const link of state.data.links) await request.delete(`/api/support/me/whatsapp/links/${link.id}`, { headers: bearer(student.token) });
    const created = await request.post('/api/support/me/whatsapp/verifications', { headers: bearer(student.token), data: { consentAccepted: true, consentVersion: state.data.consentVersion } });
    expect(created.status()).toBe(201);
    const verification = ((await created.json()) as { data: { id: string; code: string } }).data;
    await request.post('/api/admin/support/simulator/inbound', { headers: bearer(admin), data: { channelId, from, text: verification.code } });
    const proven = (await (await request.get(`/api/support/me/whatsapp/verifications/${verification.id}`, { headers: bearer(student.token) })).json()) as { data: { status: string; contactMasked: string; previousTicketsCount: number } };
    expect(proven.data.status).toBe('proven');
    expect(proven.data.contactMasked).toContain(last4);
    // antes de confirmar, o chamado não é do estudante
    expect((await request.get(`/api/support/tickets/${ticketId}`, { headers: bearer(student.token) })).status()).toBe(404);
    const confirmed = await request.post(`/api/support/me/whatsapp/verifications/${verification.id}/confirm`, { headers: bearer(student.token), data: { linkPreviousTickets: true } });
    expect(confirmed.status()).toBe(200);
    expect((await request.get(`/api/support/tickets/${ticketId}`, { headers: bearer(student.token) })).status()).toBe(200);

    // 7. Atendente muda a situação na tela; o app do estudante recebe sem recarregar (long polling), e fica salvo
    const head = (await (await request.get('/api/support/me/events', { headers: bearer(student.token) })).json()) as { data: { nextCursor: string } };
    const live = request.get('/api/support/me/events', { headers: bearer(student.token), params: { since: head.data.nextCursor, wait: 20 }, timeout: 30_000 });
    await expect(staff.getByRole('region', { name: 'Conversa' }).getByText('Sem vínculo verificado')).toHaveCount(0, { timeout: 15_000 });
    await staff.reload();
    await staff.getByRole('region', { name: 'Contexto do atendimento' }).getByRole('tab', { name: 'Ações' }).click();
    await staff.getByLabel('Nova situação').selectOption('in_progress');
    await staff.getByRole('button', { name: /^(Atualizar|Mudar|Salvar|Aplicar)/ }).first().click();
    const feed = (await (await live).json()) as { data: { events: Array<{ type: string; ticketId: string; data: { to?: string; publicLabel?: string } }> } };
    const statusEvent = feed.data.events.find((item) => item.ticketId === ticketId && item.type === 'support.ticket.status_changed');
    expect(statusEvent?.data).toMatchObject({ to: 'in_progress', publicLabel: 'Em atendimento' });
    const after = (await (await request.get(`/api/support/tickets/${ticketId}`, { headers: bearer(student.token) })).json()) as { data: { status: string; messages: unknown[]; events: Array<{ title: string }> } };
    expect(after.data.status).toBe('in_progress');
    // sem autorização de espelhamento, o app mostra o andamento e não a conversa do WhatsApp
    expect(after.data.messages).toEqual([]);

    // 8. Nota interna não chega ao estudante
    await staff.getByRole('button', { name: 'Nota interna' }).click();
    await staff.getByLabel(/Nota interna: nunca sai no WhatsApp/).fill('Conferir com a secretaria antes de responder.');
    await staff.getByRole('button', { name: 'Salvar nota' }).click();
    await expect(staff.getByText('Nota interna registrada.').first()).toBeVisible();
    const withNote = await request.get(`/api/support/tickets/${ticketId}`, { headers: bearer(student.token) });
    expect(await withNote.text()).not.toContain('Conferir com a secretaria');

    // 9. Outro estudante não vê nada, por nenhuma rota
    const other = await mobileLogin(request, 'estudante.regular@demo.asa');
    expect((await request.get(`/api/support/tickets/${ticketId}`, { headers: bearer(other.token) })).status()).toBe(404);
    const otherHead = (await (await request.get('/api/support/me/events', { headers: bearer(other.token) })).json()) as { data: { nextCursor: string } };
    await staff.getByRole('button', { name: 'Chat do app' }).click();
    const otherEvents = (await (await request.get('/api/support/me/events', { headers: bearer(other.token) , params: { since: otherHead.data.nextCursor } })).json()) as { data: { events: Array<{ ticketId: string }> } };
    expect(otherEvents.data.events.filter((item) => item.ticketId === ticketId)).toEqual([]);

    // 10. Gateway cai: o chamado continua acessível e a tela mostra o motivo; nada é marcado como entregue
    await setConnection(request, admin, channelId!, 'DISCONNECTED');
    await expect(staff.getByText('WhatsApp: Desconectado')).toBeVisible({ timeout: 15_000 });
    await staff.getByRole('button', { name: 'WhatsApp', exact: true }).click();
    await expect(staff.getByRole('alert').filter({ hasText: 'desconectado' })).toBeVisible({ timeout: 15_000 });
    await expect(staff.getByRole('button', { name: 'Enviar pelo WhatsApp' })).toBeDisabled();
    await evidence(staff, '04-canal-desconectado');
    expect((await request.get(`/api/support/tickets/${ticketId}`, { headers: bearer(student.token) })).status()).toBe(200);
    await setConnection(request, admin, channelId!, 'CONNECTED');

    // limpeza: o número sintético não fica ligado à conta de demonstração
    const finalState = (await (await request.get('/api/support/me/whatsapp', { headers: bearer(student.token) })).json()) as { data: { links: Array<{ id: string }> } };
    for (const link of finalState.data.links) await request.delete(`/api/support/me/whatsapp/links/${link.id}`, { headers: bearer(student.token) });

    expect(consoleErrors.filter((text) => !/409|Failed to load resource/.test(text))).toEqual([]);
    await staffContext.close();
  });

  test('QR e conexão só na administração; a administração não abre as conversas', async ({ browser, request }) => {
    const admin = await adminToken(request);
    const channelId = await demoChannel(request, admin);
    test.skip(!channelId, 'requer ASA_WHATSAPP_PROVIDER=fake na API');
    await setConnection(request, admin, channelId!, 'DISCONNECTED');
    const adminContext = await browser.newContext({ storageState: authFile('admin'), viewport: { width: 1280, height: 900 } });
    const page = await adminContext.newPage();
    await page.goto('/admin/canais/whatsapp');
    await expect(page.getByRole('heading', { name: 'Canal WhatsApp' })).toBeVisible();
    await expect(page.getByText(/nenhum número real é conectado/)).toBeVisible();
    await page.getByRole('button', { name: 'Conectar conta institucional' }).click();
    await expect(page.getByText(/este QR nao conecta nenhum numero real/)).toBeVisible();
    await evidence(page, '05-admin-canal-demonstracao');
    await page.getByRole('button', { name: 'Concluir conexão' }).click();
    await expect(page.getByLabel(/Canal Canal de demonstração/).getByText('Conectado', { exact: true })).toBeVisible({ timeout: 20_000 });

    // a administração gerencia o canal sem ler conversas
    await page.goto('/asa/atendimento');
    await expect(page.getByRole('heading', { name: 'Central de Atendimento' })).toHaveCount(0);

    const staff = await mobileLogin(request, ACCOUNTS.staff.email);
    expect((await request.post(`/api/admin/support/channels/${channelId}/connect`, { headers: bearer(staff.token) })).status()).toBe(403);
    const student = await mobileLogin(request, ACCOUNTS.student.email);
    expect((await request.post(`/api/admin/support/channels/${channelId}/connect`, { headers: bearer(student.token) })).status()).toBe(403);
    expect((await request.get('/api/support/staff/events', { headers: bearer(admin) })).status()).toBe(403);
    await adminContext.close();
  });

  test('tablet e celular navegam em sequência, sem sobrepor painéis', async ({ browser, request }) => {
    const admin = await adminToken(request);
    const channelId = await demoChannel(request, admin);
    test.skip(!channelId, 'requer ASA_WHATSAPP_PROVIDER=fake na API');
    await setConnection(request, admin, channelId!, 'CONNECTED');
    const from = contactNumber();
    const text = `Mensagem para o teste em tela pequena ${from.slice(-4)}`;
    await request.post('/api/admin/support/simulator/inbound', { headers: bearer(admin), data: { channelId, from, text } });
    const mobileContext = await browser.newContext({ storageState: authFile('staff'), viewport: { width: 390, height: 844 } });
    const page = await mobileContext.newPage();
    await page.goto('/asa/atendimento?fila=unidentified');
    await expect(page.getByRole('separator')).toHaveCount(0);
    // expressão em texto: o tsconfig dos testes E2E não carrega os tipos do DOM
    const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: new RegExp(from.slice(-4)) }).first().click();
    // a conversa substitui a lista: só a mensagem na conversa, não a prévia na fila
    await expect(page.getByRole('article').getByText(text)).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Filas de atendimento' })).toHaveCount(0);
    await evidence(page, '06-celular-conversa');
    await page.getByRole('button', { name: 'Mostrar o painel de contexto' }).click();
    await expect(page.getByRole('tablist', { name: 'Contexto do atendimento' })).toBeVisible();
    await page.getByRole('button', { name: 'Voltar para a conversa' }).click();
    await page.getByRole('button', { name: 'Voltar para a caixa de entrada' }).click();
    await expect(page.getByRole('tablist', { name: 'Filas de atendimento' })).toBeVisible();
    await mobileContext.close();
  });
});
