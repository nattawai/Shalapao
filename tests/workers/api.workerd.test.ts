import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Env } from '../../src/config';
import { newId, nowIso, today } from '../../src/domain/id';
import { authMiddleware, type AuthEnv } from '../../src/middleware/auth';
import { upsertUserByLineId } from '../../src/repositories/app-user.repository';
import { categoryRoutes } from '../../src/routes/category.route';
import { httpError } from '../../src/routes/http-error';
import { pocketRoutes } from '../../src/routes/pocket.route';

const db = env.DB;
const runEnv = env as unknown as Env;

// verify ถูก stub: Bearer token ทำหน้าที่เป็น sub ตรง ๆ → 'Bearer alice' คือผู้ใช้ alice
// (ไม่ยิง network · ไม่ใช้ LINE userId จริง — แต่งขึ้นทั้งหมดตาม §2.2)
function makeApp(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use(
    '/api/*',
    authMiddleware({
      verifyIdToken: async (token) => ({
        iss: 'https://access.line.me',
        sub: token,
        aud: 'CHANNEL',
        exp: 9_999_999_999,
        name: token
      }),
      upsertUser: upsertUserByLineId,
      getChannelId: () => 'CHANNEL'
    })
  );
  app.route('/api/pockets', pocketRoutes);
  app.route('/api/categories', categoryRoutes);
  app.onError(httpError);
  return app;
}

function as(user: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } };
}

// user id ไม่ซ้ำต่อเทสต์ — ไม่พึ่งการ rollback ของ isolated storage (เหมือน repo tests)
let app: Hono<AuthEnv>;
let alice: string;
let bob: string;
beforeEach(() => {
  app = makeApp();
  alice = newId();
  bob = newId();
});

describe('GET/POST /api/pockets', () => {
  test('happy: สร้างแล้วอ่านกลับ · balance เป็นสตางค์ (ไม่แปลงเป็นบาท)', async () => {
    const created = await app.request('/api/pockets', as(alice, { method: 'POST', body: JSON.stringify({ name: 'เงินเก็บ' }) }), runEnv);
    expect(created.status).toBe(201);
    const { pocket } = (await created.json()) as { pocket: { id: string; kind: string; balanceSatang: number } };
    expect(pocket.kind).toBe('holds_balance'); // default จาก zod
    expect(pocket.balanceSatang).toBe(0);

    // seed entry ตรง ๆ แล้วอ่านผ่าน API — ยอดต้องเป็น 350000 สตางค์ ไม่ใช่ 3500 บาท
    await db
      .prepare(
        `INSERT INTO entry (id, pocket_id, created_by_user_id, amount_satang, occurred_on, source, created_at)
         VALUES (?, ?, (SELECT id FROM app_user WHERE line_user_id = ?), ?, ?, 'manual', ?)`
      )
      .bind(newId(), pocket.id, alice, 350000, today(), nowIso())
      .run();

    const listed = await app.request('/api/pockets', as(alice), runEnv);
    expect(listed.status).toBe(200);
    const { pockets } = (await listed.json()) as { pockets: { id: string; balanceSatang: number }[] };
    expect(pockets.find((p) => p.id === pocket.id)?.balanceSatang).toBe(350000);
  });

  test('401 เมื่อไม่มี Authorization (auth middleware) — ไม่บอกเหตุผล', async () => {
    const res = await app.request('/api/pockets', { method: 'GET' }, runEnv);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  test('400 เมื่อ body ผิด (ไม่มีชื่อ) — zod · มี message ไทย', async () => {
    const res = await app.request('/api/pockets', as(alice, { method: 'POST', body: JSON.stringify({ kind: 'holds_balance' }) }), runEnv);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('validation_error');
    expect(body.message).toMatch(/ชื่อ|กระเป๋า/);
  });

  test('400 เมื่อ kind เป็นค่านอก enum', async () => {
    const res = await app.request('/api/pockets', as(alice, { method: 'POST', body: JSON.stringify({ name: 'x', kind: 'weird' }) }), runEnv);
    expect(res.status).toBe(400);
  });

  test('403 เมื่อ parentId เป็นกระเป๋าของผู้ใช้อื่น', async () => {
    const bobPocket = await app.request('/api/pockets', as(bob, { method: 'POST', body: JSON.stringify({ name: 'ของบ๊อบ' }) }), runEnv);
    const bobId = ((await bobPocket.json()) as { pocket: { id: string } }).pocket.id;

    const res = await app.request('/api/pockets', as(alice, { method: 'POST', body: JSON.stringify({ name: 'แอบเกาะ', parentId: bobId }) }), runEnv);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('parent_not_accessible');
  });

  // 🔴 §2.3 กันรั่วข้ามผู้ใช้ — ห้ามลบ ห้าม skip
  test('ผู้ใช้ A เรียก GET /api/pockets ไม่เห็นกระเป๋าของผู้ใช้ B', async () => {
    await app.request('/api/pockets', as(alice, { method: 'POST', body: JSON.stringify({ name: 'ของอลิซ' }) }), runEnv);
    await app.request('/api/pockets', as(bob, { method: 'POST', body: JSON.stringify({ name: 'ของบ๊อบ' }) }), runEnv);

    const bobList = await app.request('/api/pockets', as(bob), runEnv);
    const { pockets } = (await bobList.json()) as { pockets: { name: string }[] };
    expect(pockets.map((p) => p.name)).toEqual(['ของบ๊อบ']);
  });

  test('includeArchived=true คืนกระเป๋าที่ archive แล้วด้วย', async () => {
    const created = await app.request('/api/pockets', as(alice, { method: 'POST', body: JSON.stringify({ name: 'เก็บแล้ว' }) }), runEnv);
    const id = ((await created.json()) as { pocket: { id: string } }).pocket.id;
    await db.prepare('UPDATE pocket SET archived_at = ? WHERE id = ?').bind(nowIso(), id).run();

    const def = await app.request('/api/pockets', as(alice), runEnv);
    expect(((await def.json()) as { pockets: unknown[] }).pockets).toHaveLength(0);

    const inc = await app.request('/api/pockets?includeArchived=true', as(alice), runEnv);
    expect(((await inc.json()) as { pockets: unknown[] }).pockets).toHaveLength(1);
  });
});

describe('GET/POST /api/categories', () => {
  test('happy: สร้างแล้วอ่านกลับ', async () => {
    const created = await app.request('/api/categories', as(alice, { method: 'POST', body: JSON.stringify({ name: 'อาหาร' }) }), runEnv);
    expect(created.status).toBe(201);
    const listed = await app.request('/api/categories', as(alice), runEnv);
    const { categories } = (await listed.json()) as { categories: { name: string }[] };
    expect(categories.map((c) => c.name)).toEqual(['อาหาร']);
  });

  test('400 เมื่อไม่มีชื่อ', async () => {
    const res = await app.request('/api/categories', as(alice, { method: 'POST', body: JSON.stringify({}) }), runEnv);
    expect(res.status).toBe(400);
  });

  // 🔴 §2.3 กันรั่วข้ามผู้ใช้
  test('ผู้ใช้ A ไม่เห็นหมวดของผู้ใช้ B', async () => {
    await app.request('/api/categories', as(alice, { method: 'POST', body: JSON.stringify({ name: 'ของอลิซ' }) }), runEnv);
    await app.request('/api/categories', as(bob, { method: 'POST', body: JSON.stringify({ name: 'ของบ๊อบ' }) }), runEnv);

    const bobList = await app.request('/api/categories', as(bob), runEnv);
    const { categories } = (await bobList.json()) as { categories: { name: string }[] };
    expect(categories.map((c) => c.name)).toEqual(['ของบ๊อบ']);
  });
});
