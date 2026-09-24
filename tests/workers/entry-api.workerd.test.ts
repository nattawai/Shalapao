import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Env } from '../../src/config';
import { newId } from '../../src/domain/id';
import { authMiddleware, type AuthEnv } from '../../src/middleware/auth';
import { upsertUserByLineId } from '../../src/repositories/app-user.repository';
import { categoryRoutes } from '../../src/routes/category.route';
import { entryRoutes, transferRoutes } from '../../src/routes/entry.route';
import { httpError } from '../../src/routes/http-error';
import { pocketRoutes } from '../../src/routes/pocket.route';

const db = env.DB;
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
  app.route('/api/categories', categoryRoutes);
  app.route('/api/entries', entryRoutes);
  app.route('/api/transfers', transferRoutes);
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

async function createPocket(user: string, name: string): Promise<string> {
  const res = await app.request('/api/pockets', as(user, { method: 'POST', body: JSON.stringify({ name }) }), runEnv);
  return ((await res.json()) as { pocket: { id: string } }).pocket.id;
}

async function createCategory(user: string, name: string): Promise<string> {
  const res = await app.request('/api/categories', as(user, { method: 'POST', body: JSON.stringify({ name }) }), runEnv);
  return ((await res.json()) as { category: { id: string } }).category.id;
}

async function post(user: string, path: string, body: unknown): Promise<Response> {
  return app.request(path, as(user, { method: 'POST', body: JSON.stringify(body) }), runEnv);
}

async function del(user: string, id: string): Promise<Response> {
  return app.request('/api/entries/' + id, as(user, { method: 'DELETE' }), runEnv);
}

async function entryId(res: Response): Promise<string> {
  return ((await res.json()) as { entry: { id: string } }).entry.id;
}

describe('POST /api/entries', () => {
  test('happy: เงินเข้า (+) และเงินออก (−) — 201 · ยอดเป็นสตางค์', async () => {
    const p = await createPocket(alice, 'เงินเก็บ');
    const inc = await post(alice, '/api/entries', { pocketId: p, amountSatang: 50000 });
    expect(inc.status).toBe(201);
    expect(((await inc.json()) as { entry: { amountSatang: number } }).entry.amountSatang).toBe(50000);

    const out = await post(alice, '/api/entries', { pocketId: p, amountSatang: -6100, note: 'กาแฟ' });
    expect(out.status).toBe(201);
    expect(((await out.json()) as { entry: { amountSatang: number } }).entry.amountSatang).toBe(-6100);
  });

  test('401 เมื่อไม่มี token', async () => {
    const res = await app.request('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pocketId: 'x', amountSatang: 1 }) }, runEnv);
    expect(res.status).toBe(401);
  });

  test('400 เมื่อ amountSatang = 0', async () => {
    const p = await createPocket(alice, 'p');
    expect((await post(alice, '/api/entries', { pocketId: p, amountSatang: 0 })).status).toBe(400);
  });

  test('400 เมื่อ amountSatang เป็นทศนิยม', async () => {
    const p = await createPocket(alice, 'p');
    expect((await post(alice, '/api/entries', { pocketId: p, amountSatang: 6100.5 })).status).toBe(400);
  });

  test("400 เมื่อ occurredOn = '2026-99-99' (รูปแบบถูกแต่ไม่ใช่วันจริง)", async () => {
    const p = await createPocket(alice, 'p');
    expect((await post(alice, '/api/entries', { pocketId: p, amountSatang: 100, occurredOn: '2026-99-99' })).status).toBe(400);
  });

  test('400 เมื่อมี field แปลกปลอม (strict)', async () => {
    const p = await createPocket(alice, 'p');
    expect((await post(alice, '/api/entries', { pocketId: p, amountSatang: 100, evil: 1 })).status).toBe(400);
  });

  test('403 เมื่อลงรายการในกระเป๋าของผู้ใช้อื่น', async () => {
    const bobPocket = await createPocket(bob, 'ของบ๊อบ');
    const res = await post(alice, '/api/entries', { pocketId: bobPocket, amountSatang: 100 });
    expect(res.status).toBe(403);
  });

  test('403 เมื่อ categoryId เป็นของผู้ใช้อื่น', async () => {
    const p = await createPocket(alice, 'p');
    const bobCat = await createCategory(bob, 'หมวดบ๊อบ');
    const res = await post(alice, '/api/entries', { pocketId: p, amountSatang: 100, categoryId: bobCat });
    expect(res.status).toBe(403);
  });

  test('409 เมื่อลงรายการทับงวดที่กระทบยอดแล้ว', async () => {
    const p = await createPocket(alice, 'p');
    await db.prepare('UPDATE pocket SET last_reconciled_at = ? WHERE id = ?').bind('2026-03-15', p).run();
    const res = await post(alice, '/api/entries', { pocketId: p, amountSatang: 100, occurredOn: '2026-03-15' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('reconciled_period');
  });
});

describe('DELETE /api/entries/:id', () => {
  test('204 ลบรายการงวดที่ยังเปิด · แล้วไม่โผล่ในรายการอีก', async () => {
    const p = await createPocket(alice, 'p');
    const id = await entryId(await post(alice, '/api/entries', { pocketId: p, amountSatang: 50000, occurredOn: '2026-03-10' }));
    const res = await del(alice, id);
    expect(res.status).toBe(204);
    const list = await app.request(`/api/pockets/${p}/entries`, as(alice), runEnv);
    expect(((await list.json()) as { entries: unknown[] }).entries).toEqual([]);
  });

  test('404 ลบรายการที่ลบไปแล้ว', async () => {
    const p = await createPocket(alice, 'p');
    const id = await entryId(await post(alice, '/api/entries', { pocketId: p, amountSatang: 100 }));
    await del(alice, id);
    expect((await del(alice, id)).status).toBe(404);
  });

  test('403 ลบรายการของผู้ใช้อื่น', async () => {
    const bobPocket = await createPocket(bob, 'ของบ๊อบ');
    const id = await entryId(await post(bob, '/api/entries', { pocketId: bobPocket, amountSatang: 100 }));
    expect((await del(alice, id)).status).toBe(403);
  });

  test('409 ลบรายการในงวดที่กระทบยอดแล้ว', async () => {
    const p = await createPocket(alice, 'p');
    const id = await entryId(await post(alice, '/api/entries', { pocketId: p, amountSatang: 100, occurredOn: '2026-03-10' }));
    await db.prepare('UPDATE pocket SET last_reconciled_at = ? WHERE id = ?').bind('2026-03-15', p).run();
    const res = await del(alice, id);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('reconciled_period');
  });
});

describe('POST /api/transfers', () => {
  test('happy: โยกเงิน — 201 · สองขาลงครบทั้งสองกระเป๋า', async () => {
    const from = await createPocket(alice, 'ต้นทาง');
    const to = await createPocket(alice, 'ปลายทาง');
    const res = await post(alice, '/api/transfers', { fromPocketId: from, toPocketId: to, amountSatang: 30000 });
    expect(res.status).toBe(201);
    const { outflow, inflow } = (await res.json()) as { outflow: { amountSatang: number }; inflow: { amountSatang: number } };
    expect(outflow.amountSatang).toBe(-30000);
    expect(inflow.amountSatang).toBe(30000);

    const fromList = await app.request(`/api/pockets/${from}/entries`, as(alice), runEnv);
    const toList = await app.request(`/api/pockets/${to}/entries`, as(alice), runEnv);
    expect(((await fromList.json()) as { entries: { amountSatang: number }[] }).entries.map((e) => e.amountSatang)).toEqual([-30000]);
    expect(((await toList.json()) as { entries: { amountSatang: number }[] }).entries.map((e) => e.amountSatang)).toEqual([30000]);
  });

  test('400 เมื่อยอดโยก <= 0', async () => {
    const from = await createPocket(alice, 'a');
    const to = await createPocket(alice, 'b');
    expect((await post(alice, '/api/transfers', { fromPocketId: from, toPocketId: to, amountSatang: -5 })).status).toBe(400);
    expect((await post(alice, '/api/transfers', { fromPocketId: from, toPocketId: to, amountSatang: 0 })).status).toBe(400);
  });

  test('400 เมื่อโยกเข้ากระเป๋าเดียวกัน (repo → ValidationError)', async () => {
    const p = await createPocket(alice, 'p');
    const res = await post(alice, '/api/transfers', { fromPocketId: p, toPocketId: p, amountSatang: 100 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('same_pocket_transfer');
  });

  test('403 เมื่อปลายทางเป็นกระเป๋าของผู้ใช้อื่น', async () => {
    const from = await createPocket(alice, 'ของอลิซ');
    const bobPocket = await createPocket(bob, 'ของบ๊อบ');
    const res = await post(alice, '/api/transfers', { fromPocketId: from, toPocketId: bobPocket, amountSatang: 100 });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/pockets/:id/entries', () => {
  test('เจ้าของเห็นรายการเรียงตามวัน', async () => {
    const p = await createPocket(alice, 'p');
    await post(alice, '/api/entries', { pocketId: p, amountSatang: 100, occurredOn: '2026-03-02' });
    await post(alice, '/api/entries', { pocketId: p, amountSatang: 200, occurredOn: '2026-03-01' });
    const res = await app.request(`/api/pockets/${p}/entries`, as(alice), runEnv);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { entries: { amountSatang: number }[] }).entries.map((e) => e.amountSatang)).toEqual([200, 100]);
  });

  // 🔴 §2.3 — กระเป๋าคนอื่น → array ว่าง ไม่ใช่ 404 (จะบอกว่ากระเป๋ามีจริงไหม = รั่ว) ไม่ใช่ 403
  test('กระเป๋าของผู้ใช้อื่น → 200 array ว่าง', async () => {
    const bobPocket = await createPocket(bob, 'ของบ๊อบ');
    await post(bob, '/api/entries', { pocketId: bobPocket, amountSatang: 999 });

    const res = await app.request(`/api/pockets/${bobPocket}/entries`, as(alice), runEnv);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { entries: unknown[] }).entries).toEqual([]);
  });
});
