import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgGapStore } from '../../src/brain/gaps.js';
import { PgSitePageStore } from '../../src/brain/siteStore.js';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/** Migration 018: perguntas sem resposta agrupadas, mascaradas e reabertas quando voltam. */
describeDb('cérebro: perguntas sem resposta (PostgreSQL)', () => {
  let db: DatabaseHandle;
  beforeAll(async () => {
    db = await prepareDatabase();
  });
  afterAll(async () => {
    await db?.close();
  });

  it('agrupa variações, mascara dados e reabre depois de resolvida', async () => {
    const store = new PgGapStore(db.pool);
    const at = new Date('2026-11-24T12:00:00Z');
    await store.record('Tem estacionamento? meu RA é 20261234', 'voice', at);
    await store.record('tem estacionamento meu ra é 20261234', 'text', new Date('2026-11-24T13:00:00Z'));
    let list = await store.list({ status: 'open', limit: 10 });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ timesAsked: 2, lastChannel: 'text', question: 'tem estacionamento meu ra é [número]' });
    const { rows } = await db.pool.query<{ users: string }>("select count(*)::text as users from information_schema.columns where table_name = 'assistant_knowledge_gaps' and column_name in ('user_id', 'student_id')");
    expect(rows[0]!.users).toBe('0');

    const resolved = await store.setStatus(list.items[0]!.id, { status: 'resolved', resolutionNote: 'Nota criada', actorId: null, at });
    expect(resolved).toMatchObject({ status: 'resolved', resolutionNote: 'Nota criada' });
    expect(await store.setStatus('00000000-0000-4000-8000-000000000000', { status: 'ignored', resolutionNote: null, actorId: null, at })).toBeNull();

    await store.record('tem estacionamento meu ra é 20261234', 'text', at);
    list = await store.list({ limit: 10 });
    expect(list.counts).toEqual({ open: 1, resolved: 0, ignored: 0 });
  });

  it('páginas do site: grava, relê, conta falha sem perder conteúdo e marca as que saíram', async () => {
    const store = new PgSitePageStore(db.pool);
    const at = new Date('2026-11-24T12:00:00Z');
    const url = 'https://www.fecap.br/biblioteca/';
    await store.save({ url, folder: 'Institucional', title: 'Biblioteca', lastmod: '2026-11-01', blocks: [{ tag: 'p', text: 'Horário' }] }, at);
    await store.markFailed({ url, folder: 'Institucional', lastmod: '2026-11-20' }, at);
    expect(await store.listActive()).toEqual([{ url, folder: 'Institucional', title: 'Biblioteca', lastmod: '2026-11-01', blocks: [{ tag: 'p', text: 'Horário' }] }]);
    expect((await store.states())[0]).toMatchObject({ status: 'active', failCount: 1 });
    expect(await store.markGone([url])).toBe(1);
    expect(await store.stats()).toEqual({ pages: 0, lastFetchedAt: at.toISOString() });
    await expect(store.save({ url: 'https://evil.example/', folder: 'Institucional', title: 'x', lastmod: null, blocks: [] }, at)).rejects.toThrow();
  });
});
