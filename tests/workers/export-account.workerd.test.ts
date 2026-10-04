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
import { exportMe } from '../../src/routes/me.route';
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
  app.get('/api/me/export', exportMe);
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
async function addEntry(user: string, pocketId: string, amountSatang: number, categoryId?: string): Promise<string> {
  const body = categoryId !== undefined ? { pocketId, amountSatang, categoryId } : { pocketId, amountSatang };
  const res = await app.request('/api/entries', as(user, { method: 'POST', body: JSON.stringify(body) }), runEnv);
  return ((await res.json()) as { entry: { id: string } }).entry.id;
}
async function appUserId(token: string): Promise<string> {
  const row = await db.prepare('SELECT id FROM app_user WHERE line_user_id = ?').bind(token).first<{ id: string }>();
  return row!.id;
}

type Export = {
  exportedAt: string;
  amountUnit: string;
  user: { id: string; lineUserId: string } | null;
  categories: { id: string }[];
  pockets: { id: string; name: string }[];
  memberships: { pocketId: string; userId: string }[];
  entries: { id: string; amountSatang: number; createdByUserId: string; deletedAt: string | null; pocketId: string }[];
  reconciles: { id: string; reconciledBy: string }[];
};
async function exportAs(user: string): Promise<{ res: Response; body: Export }> {
  const res = await app.request('/api/me/export', as(user), runEnv);
  return { res, body: (await res.json()) as Export };
}

describe('GET /api/me/export', () => {
  test('401 เมื่อไม่มี token', async () => {
    const res = await app.request('/api/me/export', {}, runEnv);
    expect(res.status).toBe(401);
  });

  test('ส่งออกข้อมูลของตัวเองครบ · รวมที่ลบแล้ว · ยอดเป็นจำนวนเต็ม · header ดาวน์โหลด .json', async () => {
    const p = await createPocket(alice, 'ของอลิซ');
    const cat = await createCategory(alice, 'หมวดอลิซ');
    await addEntry(alice, p, -6100, cat);
    const deletedId = await addEntry(alice, p, -3000, cat);
    await app.request(`/api/entries/${deletedId}`, as(alice, { method: 'DELETE' }), runEnv); // ลบไป 1 รายการ
    const aliceId = await appUserId(alice);
    await db
      .prepare(
        `INSERT INTO pocket_reconcile (id, pocket_id, reconciled_by, as_of_date, expected_satang, actual_satang, adjustment_id, previous_line, created_at)
         VALUES (?, ?, ?, '2026-01-01', 0, 0, NULL, NULL, ?)`
      )
      .bind(newId(), p, aliceId, nowIso())
      .run();

    const { res, body } = await exportAs(alice);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="shalapao-export-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.headers.get('content-type')).toContain('application/json');

    expect(body.amountUnit).toBe('satang');
    expect(body.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.user?.id).toBe(aliceId);
    expect(body.user?.lineUserId).toBe(alice);
    expect(body.categories.map((c) => c.id)).toContain(cat);
    expect(body.pockets.map((x) => x.id)).toEqual([p]);
    expect(body.reconciles).toHaveLength(1);
    expect(body.reconciles[0]?.reconciledBy).toBe(aliceId);

    // รวมรายการที่ลบแล้วพร้อม deletedAt
    const deleted = body.entries.find((e) => e.id === deletedId);
    expect(deleted?.deletedAt).not.toBeNull();
    expect(body.entries).toHaveLength(2);
    // ยอดทุกตัวเป็นจำนวนเต็ม (ไม่ถูกหารร้อยเป็น float)
    for (const e of body.entries) expect(Number.isInteger(e.amountSatang)).toBe(true);
  });

  // 🔴 Alice export แล้วต้องไม่มีข้อมูลของ Bob สักแถวในทุก key
  test('ไม่มีข้อมูลของ Bob ใน export ของ Alice', async () => {
    const pA = await createPocket(alice, 'ของอลิซ');
    await addEntry(alice, pA, 1000);
    const pB = await createPocket(bob, 'ของบ๊อบ');
    await createCategory(bob, 'หมวดบ๊อบ');
    await addEntry(bob, pB, 99999);
    const bobId = await appUserId(bob);

    const { body } = await exportAs(alice);
    expect(body.pockets.map((x) => x.id)).not.toContain(pB);
    expect(body.entries.every((e) => e.createdByUserId !== bobId)).toBe(true);
    expect(body.memberships.every((m) => m.userId !== bobId)).toBe(true);
  });

  // 🔴 กระเป๋าร่วม (จัดฉาก SQL): entry ของ Bob ไม่อยู่ใน export ของ Alice · memberships ไม่มีแถว Bob
  test('กระเป๋าร่วม → entry ของ Bob ไม่หลุด · memberships เฉพาะ Alice · pocket ส่งได้', async () => {
    const shared = await createPocket(bob, 'กระเป๋าร่วม');
    await createPocket(alice, 'ของอลิซเดี่ยว');
    const aliceId = await appUserId(alice);
    await db
      .prepare('INSERT INTO pocket_member (pocket_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .bind(shared, aliceId, 'editor', nowIso())
      .run();
    const bobEntry = await addEntry(bob, shared, 100000); // รายการของ Bob ในกระเป๋าร่วม

    const { body } = await exportAs(alice);
    // pocket ร่วมส่งได้ (ชื่อเป็นของร่วม)
    expect(body.pockets.map((x) => x.id)).toContain(shared);
    // 🔴 entry ของ Bob ต้องไม่อยู่
    expect(body.entries.map((e) => e.id)).not.toContain(bobEntry);
    expect(body.entries.every((e) => e.pocketId !== shared || e.createdByUserId === aliceId)).toBe(true);
    // memberships เฉพาะ Alice (รวมแถวกระเป๋าร่วมของ Alice) · ไม่มีของ Bob
    expect(body.memberships.every((m) => m.userId === aliceId)).toBe(true);
    expect(body.memberships.some((m) => m.pocketId === shared)).toBe(true);
  });
});
