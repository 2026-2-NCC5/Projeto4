import { expect, test } from '@playwright/test';
import { ACCOUNTS, authFile, bearer, mobileLogin, requestKey } from './support/accounts';

/**
 * Mesmo chamado nos dois canais: aberto pelo app (Bearer), respondido pela equipe no portal (cookie + CSRF),
 * lido pelo aluno no portal e no app. Tudo contra a API e o banco reais.
 */
test('chamado aberto pelo app, respondido pela equipe no portal e lido pelo aluno nos dois canais', async ({ browser, request }) => {
  const student = await mobileLogin(request, ACCOUNTS.student.email);
  const subject = `E2E entre canais ${Date.now().toString(36)}`;
  const created = await request.post('/api/support/tickets', {
    headers: bearer(student.token),
    data: {
      clientRequestId: requestKey('e2e-ticket'),
      categoryId: 'documents',
      subcategoryId: 'transcript',
      subject,
      description: 'Preciso do histórico escolar atualizado para um processo seletivo de estágio.',
    },
  });
  expect(created.status()).toBe(201);
  const ticket = ((await created.json()) as { data: { id: string; protocol: string; channel: string } }).data;
  expect(ticket.channel).toBe('app');

  try {
    // equipe no portal: abre o chamado vindo do app e responde pela tela
    const staffContext = await browser.newContext({ storageState: authFile('staff') });
    const staffPage = await staffContext.newPage();
    await staffPage.goto(`/asa/chamados/${ticket.id}`);
    await expect(staffPage.getByText(ticket.protocol).first()).toBeVisible();
    await expect(staffPage.getByText(subject).first()).toBeVisible();
    const reply = `Olá! Já pedimos o histórico à Secretaria Acadêmica (${ticket.protocol}).`;
    await staffPage.getByLabel('Resposta ao aluno').fill(reply);
    await staffPage.getByRole('button', { name: 'Enviar ao aluno' }).click();
    await expect(staffPage.getByRole('article', { name: /^Mensagem de/ }).filter({ hasText: reply })).toBeVisible();
    await staffContext.close();

    // aluno no portal (cookie de sessão) vê a resposta
    const studentContext = await browser.newContext({ storageState: authFile('student') });
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`/aluno/chamados/${ticket.id}`);
    await expect(studentPage.getByText(reply)).toBeVisible();
    await studentContext.close();

    // e no app (Bearer): a mesma mensagem, enviada pela equipe
    const fromApp = await request.get(`/api/support/tickets/${ticket.id}`, { headers: bearer(student.token) });
    const detail = ((await fromApp.json()) as { data: { messages: Array<{ content: string; senderType: string }> } }).data;
    expect(detail.messages.some((message) => message.content === reply && message.senderType === 'agent')).toBe(true);
  } finally {
    // limpeza: o aluno cancela o chamado de teste (o histórico fica, como em qualquer chamado)
    await request.post(`/api/support/tickets/${ticket.id}/cancel`, { headers: bearer(student.token), data: { reason: 'Teste automatizado (E2E)' } });
  }
});
