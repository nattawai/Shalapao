import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Env } from '../../src/config';
import { newId } from '../../src/domain/id';
import { authMiddleware, type AuthEnv } from '../../src/middleware/auth';
import { upsertUserByLineId } from '../../src/repositories/app-user.repository';
import { entryRoutes } from '../../src/routes/entry.route';
import { httpError } from '../../src/routes/http-error';
import { pocketRoutes } from '../../src/routes/pocket.route';

const runEnv = env as unknown as Env;

function makeApp(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use(
    '/api/*',
    authMiddleware({
      verifyIdToken: async (token) => ({ iss: 'https://access.line.me', sub: token, aud: 'CHANNEL', exp: 9_999_999_999, name: token }),
      upsertUser: upsertUserByLineId,
      getChannelId: () => 'CHANNEL'
    })
  );
  app.route('/api/pockets', pocketRoutes);
  app.route('/api/entries', entryRoutes);
  app.onError(httpError);
  return app;
}

function as(user: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } };
}

let app: Hono<AuthEnv>;
let alice: string;
let bob: string;
beforeEach(() => {
  app = makeApp();
  alice = newId();
  bob = newId();
});

async function createPocket(user: string, name: string, parentId?: string): Promise<string> {
  const body = parentId !== undefined ? { name, parentId } : { name };
  const res = await app.request('/api/pockets', as(user, { method: 'POST', body: JSON.stringify(body) }), runEnv);
  return ((await res.json()) as { pocket: { id: string } }).pocket.id;
}

async function addEntry(user: string, pocketId: string, amountSatang: number, occurredOn?: string): Promise<void> {
  const body = occurredOn !== undefined ? { pocketId, amountSatang, occurredOn } : { pocketId, amountSatang };
  await app.request('/api/entries', as(user, { method: 'POST', body: JSON.stringify(body) }), runEnv);
}

describe('GET /api/pockets/:id/entries?subtree=1', () => {
  test('subtree=1 คืนรายการของกระเป๋านี้ + ลูกทุกชั้น เรียงตามวัน พร้อม pocketName', async () => {
    const root = await createPocket(alice, 'ราก');
    const child = await createPocket(alice, 'ลูก', root);
    const grandchild = await createPocket(alice, 'หลาน', child);
    await addEntry(alice, child, 200, '2026-03-02');
    await addEntry(alice, root, 100, '2026-03-01');
    await addEntry(alice, grandchild, 300, '2026-03-03');

    const res = await app.request(`/api/pockets/${root}/entries?subtree=1`, as(alice), runEnv);
    expect(res.status).toBe(200);
    const entries = ((await res.json()) as { entries: { amountSatang: number; pocketName: string }[] }).entries;
    expect(entries.map((e) => e.amountSatang)).toEqual([100, 200, 300]);
    expect(entries.map((e) => e.pocketName)).toEqual(['ราก', 'ลูก', 'หลาน']);
  });

  test('ไม่มี param → พฤติกรรมเดิม (เฉพาะกระเป๋านี้ · ไม่มี pocketName)', async () => {
    const root = await createPocket(alice, 'ราก');
    const child = await createPocket(alice, 'ลูก', root);
    await addEntry(alice, root, 100);
    await addEntry(alice, child, 200);

    const res = await app.request(`/api/pockets/${root}/entries`, as(alice), runEnv);
    const entries = ((await res.json()) as { entries: Record<string, unknown>[] }).entries;
    expect(entries.map((e) => e.amountSatang)).toEqual([100]); // ไม่รวมลูก
    expect(entries[0]).not.toHaveProperty('pocketName');
  });

  test('subtree=0 → พฤติกรรมเดิม (เหมือนไม่ส่ง param)', async () => {
    const root = await createPocket(alice, 'ราก');
    const child = await createPocket(alice, 'ลูก', root);
    await addEntry(alice, root, 100);
    await addEntry(alice, child, 200);

    const res = await app.request(`/api/pockets/${root}/entries?subtree=0`, as(alice), runEnv);
    const entries = ((await res.json()) as { entries: { amountSatang: number }[] }).entries;
    expect(entries.map((e) => e.amountSatang)).toEqual([100]);
  });

  // 🔴 §2.3 — กระเป๋าคนอื่นแบบ subtree ก็ต้องได้ [] ไม่ใช่ 404 (ตามแบบแผน GET entries เดิม)
  test('subtree=1 บนกระเป๋าของผู้ใช้อื่น → 200 array ว่าง', async () => {
    const bobRoot = await createPocket(bob, 'ของบ๊อบ');
    await addEntry(bob, bobRoot, 999);

    const res = await app.request(`/api/pockets/${bobRoot}/entries?subtree=1`, as(alice), runEnv);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { entries: unknown[] }).entries).toEqual([]);
  });

  test('400 เมื่อ subtree เป็นค่านอกกติกา (strict enum)', async () => {
    const root = await createPocket(alice, 'ราก');
    const res = await app.request(`/api/pockets/${root}/entries?subtree=yes`, as(alice), runEnv);
    expect(res.status).toBe(400);
  });
});
