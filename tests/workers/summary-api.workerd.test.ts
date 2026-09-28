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
import { summaryRoutes } from '../../src/routes/summary.route';

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
  app.route('/api/entries', entryRoutes);
  app.route('/api/summary', summaryRoutes);
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

async function addEntry(user: string, pocketId: string, amountSatang: number): Promise<void> {
  await app.request('/api/entries', as(user, { method: 'POST', body: JSON.stringify({ pocketId, amountSatang }) }), runEnv);
}

type SummaryBody = { totalSatang: number; pocketCount: number };

describe('GET /api/summary', () => {
  test('401 เมื่อไม่มี token', async () => {
    const res = await app.request('/api/summary', {}, runEnv);
    expect(res.status).toBe(401);
  });

  // 🔴 กับดักนับซ้ำ: กระเป๋าซ้อน 3 ชั้น — ยอดรวมต้องเท่าผลรวม entry (นับครั้งเดียว)
  // ไม่ใช่ผลรวม rollup (แม่นับยอดลูกอยู่แล้ว บวก rollup ทุกใบ = นับซ้ำหลายรอบ)
  test('ยอดรวมเท่าผลรวม entry ที่คำนวณมือ (กระเป๋าซ้อน 3 ชั้น) · ไม่นับซ้ำจาก rollup', async () => {
    const root = await createPocket(alice, 'ราก');
    const child = await createPocket(alice, 'ลูก', root);
    const grandchild = await createPocket(alice, 'หลาน', child);
    await addEntry(alice, root, 100000);
    await addEntry(alice, child, 50000);
    await addEntry(alice, grandchild, 20000);

    const res = await app.request('/api/summary', as(alice), runEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SummaryBody;
    expect(body.totalSatang).toBe(170000); // 100000 + 50000 + 20000 (rollup จะได้ 260000)
    expect(body.pocketCount).toBe(3);
  });

  test('ยอดรวมของ A ไม่รวมยอดของ B', async () => {
    const a = await createPocket(alice, 'ของอลิซ');
    await addEntry(alice, a, 30000);
    const b = await createPocket(bob, 'ของบ๊อบ');
    await addEntry(bob, b, 999999);

    const res = await app.request('/api/summary', as(alice), runEnv);
    const body = (await res.json()) as SummaryBody;
    expect(body.totalSatang).toBe(30000);
    expect(body.pocketCount).toBe(1);
  });

  test('ไม่มีกระเป๋า → ยอด 0 · จำนวน 0', async () => {
    const res = await app.request('/api/summary', as(alice), runEnv);
    const body = (await res.json()) as SummaryBody;
    expect(body.totalSatang).toBe(0);
    expect(body.pocketCount).toBe(0);
  });

  // archived = ออกจากภาพรวมที่ใช้งานอยู่ (รายการกระเป๋าดีฟอลต์ก็ซ่อน) → ไม่นับทั้ง count และ total
  test('กระเป๋าที่ archive แล้วไม่ถูกนับ (ทั้งยอดและจำนวน)', async () => {
    const keep = await createPocket(alice, 'ใช้อยู่');
    await addEntry(alice, keep, 40000);
    const gone = await createPocket(alice, 'เลิกใช้');
    await db.prepare('UPDATE pocket SET archived_at = ? WHERE id = ?').bind('2026-01-01T00:00:00.000Z', gone).run();

    const res = await app.request('/api/summary', as(alice), runEnv);
    const body = (await res.json()) as SummaryBody;
    expect(body.totalSatang).toBe(40000);
    expect(body.pocketCount).toBe(1);
  });
});
