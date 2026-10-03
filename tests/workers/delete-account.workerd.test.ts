import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Env } from '../../src/config';
import { newId, nowIso } from '../../src/domain/id';
import { authMiddleware, type AuthEnv } from '../../src/middleware/auth';
import { upsertUserByLineId } from '../../src/repositories/app-user.repository';
import { categoryRoutes } from '../../src/routes/category.route';
import { entryRoutes } from '../../src/routes/entry.route';
import { httpError } from '../../src/routes/http-error';
import { deleteMe, me } from '../../src/routes/me.route';
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
  app.get('/api/me', me);
  app.delete('/api/me', deleteMe);
  app.route('/api/pockets', pocketRoutes);
  app.route('/api/categories', categoryRoutes);
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

async function createPocket(user: string, name: string): Promise<string> {
  const res = await app.request('/api/pockets', as(user, { method: 'POST', body: JSON.stringify({ name }) }), runEnv);
  return ((await res.json()) as { pocket: { id: string } }).pocket.id;
}
async function createCategory(user: string, name: string): Promise<string> {
  const res = await app.request('/api/categories', as(user, { method: 'POST', body: JSON.stringify({ name }) }), runEnv);
  return ((await res.json()) as { category: { id: string } }).category.id;
}
async function addEntry(user: string, pocketId: string, amountSatang: number, categoryId?: string): Promise<void> {
  const body = categoryId !== undefined ? { pocketId, amountSatang, categoryId } : { pocketId, amountSatang };
  await app.request('/api/entries', as(user, { method: 'POST', body: JSON.stringify(body) }), runEnv);
}
async function appUserId(token: string): Promise<string> {
  const row = await db.prepare('SELECT id FROM app_user WHERE line_user_id = ?').bind(token).first<{ id: string }>();
  return row!.id;
}
async function count(sql: string, ...binds: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...binds).first<{ n: number }>();
  return row!.n;
}
function del(user: string): Promise<Response> {
  return app.request('/api/me', as(user, { method: 'DELETE' }), runEnv) as Promise<Response>;
}

describe('DELETE /api/me', () => {
  test('401 เมื่อไม่มี token', async () => {
    const res = await app.request('/api/me', { method: 'DELETE' }, runEnv);
    expect(res.status).toBe(401);
  });

  // 🔴 solo: ลบแล้วเหลือ 0 แถวทุกตารางของ Alice (ตรวจทีละตาราง) · Bob ครบเหมือนเดิม
  test('ลบบัญชี solo → 0 แถวทุกตารางของ Alice · ข้อมูล Bob ไม่แตะ', async () => {
    const pA = await createPocket(alice, 'ของอลิซ');
    const cA = await createCategory(alice, 'หมวดอลิซ');
    await addEntry(alice, pA, -5000, cA);
    const aliceId = await appUserId(alice);
    // มีแถว pocket_reconcile ให้พิสูจน์ว่าโดนลบด้วย (จัดฉาก SQL ตรง ๆ)
    await db
      .prepare(
        `INSERT INTO pocket_reconcile (id, pocket_id, reconciled_by, as_of_date, expected_satang, actual_satang, adjustment_id, previous_line, created_at)
         VALUES (?, ?, ?, '2026-01-01', 0, 0, NULL, NULL, ?)`
      )
      .bind(newId(), pA, aliceId, nowIso())
      .run();

    const pB = await createPocket(bob, 'ของบ๊อบ');
    const cB = await createCategory(bob, 'หมวดบ๊อบ');
    await addEntry(bob, pB, 99999, cB);
    const bobId = await appUserId(bob);

    const res = await del(alice);
    expect(res.status).toBe(204);

    // Alice = 0 ทุกตาราง
    expect(await count('SELECT COUNT(*) AS n FROM app_user WHERE id = ?', aliceId)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM category WHERE user_id = ?', aliceId)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM pocket_member WHERE user_id = ?', aliceId)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM entry WHERE created_by_user_id = ?', aliceId)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM pocket WHERE id = ?', pA)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM pocket_reconcile WHERE pocket_id = ?', pA)).toBe(0);

    // Bob ครบเหมือนเดิม
    expect(await count('SELECT COUNT(*) AS n FROM app_user WHERE id = ?', bobId)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM category WHERE user_id = ?', bobId)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM pocket_member WHERE user_id = ?', bobId)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM entry WHERE created_by_user_id = ?', bobId)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM pocket WHERE id = ?', pB)).toBe(1);
  });

  test('ลบแล้ว GET /api/pockets ด้วย token เดิม → 200 [] ไม่ใช่ 500', async () => {
    const p = await createPocket(alice, 'p');
    await addEntry(alice, p, 1000);
    expect((await del(alice)).status).toBe(204);

    const res = await app.request('/api/pockets', as(alice), runEnv);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { pockets: unknown[] }).pockets).toEqual([]);
  });

  test('เรียกลบซ้ำ → 204 ทั้งสองครั้ง (auth สร้างบัญชีว่างใหม่แล้วลบของว่าง)', async () => {
    await createPocket(alice, 'p');
    expect((await del(alice)).status).toBe(204);
    expect((await del(alice)).status).toBe(204);
  });

  // 🔴 กระเป๋าที่มี active คนอื่น → ไม่ลบกระเป๋า/entry · แค่ตั้ง left_at (จัดฉากกระเป๋าร่วม v3 ด้วย SQL)
  test('กระเป๋าร่วม → Alice ออก (left_at) แต่กระเป๋า+entry อยู่ · Bob ยอดเท่าเดิม', async () => {
    const shared = await createPocket(bob, 'กระเป๋าร่วม');
    const aliceSolo = await createPocket(alice, 'ของอลิซเดี่ยว');
    const aliceId = await appUserId(alice);
    // ใส่ Alice เป็นสมาชิก active ของกระเป๋า Bob (API สร้างไม่ได้ — จำลอง v3)
    await db
      .prepare('INSERT INTO pocket_member (pocket_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .bind(shared, aliceId, 'editor', nowIso())
      .run();
    await addEntry(bob, shared, 100000); // entry ของ Bob ในกระเป๋าร่วม

    const res = await del(alice);
    expect(res.status).toBe(204);

    // กระเป๋าร่วม + entry ยังอยู่ · Alice ถูกตั้ง left_at (แถวยังอยู่) · solo ของ Alice หาย
    expect(await count('SELECT COUNT(*) AS n FROM pocket WHERE id = ?', shared)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM entry WHERE pocket_id = ?', shared)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM pocket_member WHERE pocket_id = ? AND user_id = ? AND left_at IS NOT NULL', shared, aliceId)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM pocket WHERE id = ?', aliceSolo)).toBe(0);
    // ทางเลือก B: app_user ของ Alice ยังอยู่ เพราะยังมี member row (left) อ้างถึง
    expect(await count('SELECT COUNT(*) AS n FROM app_user WHERE id = ?', aliceId)).toBe(1);

    // Bob เห็นกระเป๋าร่วมยอดเท่าเดิม
    const bobList = await app.request('/api/pockets', as(bob), runEnv);
    const bobShared = ((await bobList.json()) as { pockets: { id: string; balanceSatang: number }[] }).pockets.find((p) => p.id === shared);
    expect(bobShared?.balanceSatang).toBe(100000);
  });
});
