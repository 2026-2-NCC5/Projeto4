import { expect, test, type APIRequestContext } from '@playwright/test';
import { ACCOUNTS, authFile, bearer, mobileLogin, requestKey } from './support/accounts';

type Slot = { startsAt: string; mode: 'presencial' | 'online'; location: string | null; available: number };

async function freeSlots(request: APIRequestContext, token: string): Promise<Slot[] | null> {
  const response = await request.get('/api/appointments/slots', { headers: bearer(token) });
  if (response.status() !== 200) return null;
  const body = (await response.json()) as { data: { days: Array<{ slots: Slot[] }> } };
  return body.data.days.flatMap((day) => day.slots);
}

test('dois alunos disputando o último horário pelo app: um consegue e o outro recebe 409', async ({ request }) => {
  const a = await mobileLogin(request, 'estudante.desempenho@demo.asa');
  const b = await mobileLogin(request, 'estudante.frequencia@demo.asa');
  const slots = await freeSlots(request, a.token);
  test.skip(slots === null, 'agendamentos indisponíveis neste ambiente');
  const single = slots!.find((slot) => slot.available === 1);
  test.skip(!single, 'nenhum horário com uma única vaga livre nos próximos dias');
  const book = (token: string) =>
    request.post('/api/appointments', {
      headers: bearer(token),
      data: { clientRequestId: requestKey('e2e-race'), topicId: 'documents', startsAt: single!.startsAt, mode: single!.mode, location: single!.location },
    });
  const [ra, rb] = await Promise.all([book(a.token), book(b.token)]);
  const winner = ra.status() === 201 ? { response: ra, token: a.token } : rb.status() === 201 ? { response: rb, token: b.token } : null;
  try {
    expect([ra.status(), rb.status()].sort()).toEqual([201, 409]);
    const loser = ra.status() === 409 ? ra : rb;
    expect(((await loser.json()) as { error: { reason: string } }).error.reason).toBe('slot_unavailable');
  } finally {
    if (winner) {
      const id = ((await winner.response.json()) as { data: { id: string } }).data.id;
      await request.post(`/api/appointments/${id}/cancel`, { headers: bearer(winner.token), data: { reason: 'Teste automatizado (E2E)' } });
    }
  }
});

test('agendado pelo app aparece no portal do aluno e da equipe; cancelado pelo portal, o app vê o cancelamento', async ({ browser, request }) => {
  const student = await mobileLogin(request, ACCOUNTS.student.email);
  const slots = await freeSlots(request, student.token);
  test.skip(slots === null || slots.length === 0, 'sem horários livres neste ambiente');
  const slot = slots![0]!;
  const booked = await request.post('/api/appointments', {
    headers: bearer(student.token),
    data: { clientRequestId: requestKey('e2e-appt'), topicId: 'documents', startsAt: slot.startsAt, mode: slot.mode, location: slot.location },
  });
  const bookedBody = (await booked.json()) as { data?: { id: string; protocol: string; channel: string }; error?: { reason: string } };
  test.skip(booked.status() === 409 && bookedBody.error?.reason === 'active_limit', 'a conta de demonstração já está no limite de agendamentos ativos');
  expect(booked.status()).toBe(201);
  const appointment = bookedBody.data!;
  expect(appointment.channel).toBe('app');

  try {
    // equipe vê o agendamento do app (sessão por cookie)
    const staffContext = await browser.newContext({ storageState: authFile('staff') });
    const staffView = await staffContext.request.get(`/api/asa/appointments/${appointment.id}`);
    expect(staffView.status()).toBe(200);
    expect(((await staffView.json()) as { data: { protocol: string } }).data.protocol).toBe(appointment.protocol);
    await staffContext.close();

    // aluno cancela pelo portal
    const studentContext = await browser.newContext({ storageState: authFile('student') });
    const page = await studentContext.newPage();
    await page.goto(`/aluno/agendamentos?agendamento=${appointment.id}`);
    const details = page.getByRole('dialog');
    await expect(details.getByText(appointment.protocol)).toBeVisible();
    await details.getByRole('button', { name: 'Cancelar agendamento' }).click();
    const confirm = page.getByRole('dialog', { name: 'Cancelar este agendamento?' });
    await confirm.getByLabel('Motivo (opcional)').fill('Teste automatizado (E2E)');
    await confirm.getByRole('button', { name: 'Cancelar agendamento' }).click();
    await expect(page.getByText('Cancelado').first()).toBeVisible();
    await studentContext.close();

    // o app enxerga o cancelamento feito no portal
    const fromApp = await request.get(`/api/appointments/${appointment.id}`, { headers: bearer(student.token) });
    expect(((await fromApp.json()) as { data: { status: string; cancelledBy: string } }).data).toMatchObject({ status: 'cancelled', cancelledBy: 'student' });
  } finally {
    await request.post(`/api/appointments/${appointment.id}/cancel`, { headers: bearer(student.token), data: { reason: 'Teste automatizado (E2E)' } });
  }
});
