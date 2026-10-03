import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Env } from '../../src/config';
import { currentMonthRange } from '../../src/domain/date';
import { newId } from '../../src/domain/id';
import { authMiddleware, type AuthEnv } from '../../src/middleware/auth';
import { upsertUserByLineId } from '../../src/repositories/app-user.repository';
import { categoryRoutes } from '../../src/routes/category.route';
import { entryRoutes, transferRoutes } from '../../src/routes/entry.route';
import { httpError } from '../../src/routes/http-error';
import { pocketRoutes } from '../../src/routes/pocket.route';
import { summaryRoutes } from '../../src/routes/summary.route';

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

async function createPocket(user: string, name: string): Promise<string> {
  const res = await app.request('/api/pockets', as(user, { method: 'POST', body: JSON.stringify({ name }) }), runEnv);
  return ((await res.json()) as { pocket: { id: string } }).pocket.id;
}

async function createCategory(user: string, name: string): Promise<string> {
  const res = await app.request('/api/categories', as(user, { method: 'POST', body: JSON.stringify({ name }) }), runEnv);
  return ((await res.json()) as { category: { id: string } }).category.id;
}

async function addEntry(
  user: string,
  pocketId: string,
  amountSatang: number,
  opts: { categoryId?: string; occurredOn?: string } = {}
): Promise<string> {
  const body = { pocketId, amountSatang, ...opts };
  const res = await app.request('/api/entries', as(user, { method: 'POST', body: JSON.stringify(body) }), runEnv);
  return ((await res.json()) as { entry: { id: string } }).entry.id;
}

type Bucket = { inflowSatang: number; outflowSatang: number; entryCount: number };
type Row = Bucket & { categoryId: string; categoryName: string };
type Body = {
  from: string;
  to: string;
  rows: Row[];
  uncategorized: Bucket;
  totalInflowSatang: number;
  totalOutflowSatang: number;
};

async function summary(user: string, query = ''): Promise<Body> {
  const res = await app.request(`/api/summary/by-category${query}`, as(user), runEnv);
  expect(res.status).toBe(200);
  return (await res.json()) as Body;
}

const WIDE = '?from=2026-01-01&to=2026-12-31';

describe('GET /api/summary/by-category', () => {
  test('401 เมื่อไม่มี token', async () => {
    const res = await app.request('/api/summary/by-category', {}, runEnv);
    expect(res.status).toBe(401);
  });

  // 🔴 เกณฑ์สำคัญสุด: โยกเงินแล้วยอดสรุป "ไม่ขยับ" (แต่ยอดกระเป๋าต้องขยับ)
  test('โยกเงินไม่กระทบยอดสรุป แต่กระทบยอดกระเป๋า', async () => {
    const p1 = await createPocket(alice, 'กระเป๋า1');
    const p2 = await createPocket(alice, 'กระเป๋า2');
    const food = await createCategory(alice, 'ค่าอาหาร');
    await addEntry(alice, p1, -20000, { categoryId: food, occurredOn: '2026-05-10' });

    const before = await summary(alice, WIDE);
    expect(before.totalOutflowSatang).toBe(20000);
    expect(before.totalInflowSatang).toBe(0);

    await app.request('/api/transfers', as(alice, { method: 'POST', body: JSON.stringify({ fromPocketId: p1, toPocketId: p2, amountSatang: 30000, occurredOn: '2026-05-11' }) }), runEnv);

    const after = await summary(alice, WIDE);
    expect(after.totalOutflowSatang).toBe(20000); // ไม่ขยับ — ขาโยกไม่นับ
    expect(after.totalInflowSatang).toBe(0);

    // แต่ขาโยกเกิดจริง: p2 มีรายการ +30000 (ยอดกระเป๋าขยับตามปกติ)
    const p2list = await app.request(`/api/pockets/${p2}/entries`, as(alice), runEnv);
    expect(((await p2list.json()) as { entries: { amountSatang: number }[] }).entries.map((e) => e.amountSatang)).toEqual([30000]);
  });

  test('ลบรายการแล้ว outflow ลดตาม', async () => {
    const p = await createPocket(alice, 'p');
    const food = await createCategory(alice, 'ค่าอาหาร');
    await addEntry(alice, p, -5000, { categoryId: food, occurredOn: '2026-05-10' });
    const del = await addEntry(alice, p, -3000, { categoryId: food, occurredOn: '2026-05-11' });
    expect((await summary(alice, WIDE)).totalOutflowSatang).toBe(8000);

    await app.request(`/api/entries/${del}`, as(alice, { method: 'DELETE' }), runEnv);
    expect((await summary(alice, WIDE)).totalOutflowSatang).toBe(5000);
  });

  // 🔴 §2.3 — Alice ไม่เห็นยอดของ Bob
  test('Alice ไม่เห็นยอดของ Bob', async () => {
    const bp = await createPocket(bob, 'ของบ๊อบ');
    const bc = await createCategory(bob, 'หมวดบ๊อบ');
    await addEntry(bob, bp, -99999, { categoryId: bc, occurredOn: '2026-05-10' });

    const a = await summary(alice, WIDE);
    expect(a.rows).toEqual([]);
    expect(a.totalOutflowSatang).toBe(0);
    expect(a.uncategorized).toEqual({ inflowSatang: 0, outflowSatang: 0, entryCount: 0 });
  });

  // 🔴 สมการผลรวมสองบรรทัด — ต้องเป็นจริง (รวมถัง uncategorized)
  test('Σrows + uncategorized == total ทั้ง inflow และ outflow', async () => {
    const p = await createPocket(alice, 'p');
    const food = await createCategory(alice, 'ค่าอาหาร');
    const fun = await createCategory(alice, 'บันเทิง');
    await addEntry(alice, p, -20000, { categoryId: food, occurredOn: '2026-05-01' });
    await addEntry(alice, p, -7000, { categoryId: fun, occurredOn: '2026-05-02' });
    await addEntry(alice, p, 250000, { occurredOn: '2026-05-03' }); // เงินเดือน ไม่ติดหมวด
    await addEntry(alice, p, -5000, { occurredOn: '2026-05-04' }); // จ่าย ไม่ติดหมวด

    const s = await summary(alice, WIDE);
    const sumRowsIn = s.rows.reduce((a, r) => a + r.inflowSatang, 0);
    const sumRowsOut = s.rows.reduce((a, r) => a + r.outflowSatang, 0);
    expect(sumRowsIn + s.uncategorized.inflowSatang).toBe(s.totalInflowSatang);
    expect(sumRowsOut + s.uncategorized.outflowSatang).toBe(s.totalOutflowSatang);
    // ค่าจริงเพื่อกันกรณีทุกช่องเป็น 0 แล้วสมการจริงแบบว่างเปล่า
    expect(s.totalInflowSatang).toBe(250000);
    expect(s.totalOutflowSatang).toBe(32000);
    expect(s.uncategorized).toEqual({ inflowSatang: 250000, outflowSatang: 5000, entryCount: 2 });
  });

  test('outflow เป็นบวก · inflow 0 สำหรับหมวดที่มีแต่รายจ่าย · entryCount นับทุกแถว', async () => {
    const p = await createPocket(alice, 'p');
    const food = await createCategory(alice, 'ค่าอาหาร');
    await addEntry(alice, p, -6000, { categoryId: food, occurredOn: '2026-05-01' });
    await addEntry(alice, p, -4000, { categoryId: food, occurredOn: '2026-05-02' });
    await addEntry(alice, p, 1000, { categoryId: food, occurredOn: '2026-05-03' }); // คืนเงิน

    const row = (await summary(alice, WIDE)).rows.find((r) => r.categoryId === food);
    expect(row).toMatchObject({ inflowSatang: 1000, outflowSatang: 10000, entryCount: 3 });
  });

  test('rows เรียง outflow มาก→น้อย · หมวดไม่มีรายการในช่วงไม่อยู่ใน rows', async () => {
    const p = await createPocket(alice, 'p');
    const big = await createCategory(alice, 'ก้อนใหญ่');
    const small = await createCategory(alice, 'ก้อนเล็ก');
    await createCategory(alice, 'ไม่ได้ใช้'); // ไม่มีรายการ → ต้องไม่โผล่
    await addEntry(alice, p, -1000, { categoryId: small, occurredOn: '2026-05-01' });
    await addEntry(alice, p, -9000, { categoryId: big, occurredOn: '2026-05-02' });

    const rows = (await summary(alice, WIDE)).rows;
    expect(rows.map((r) => r.outflowSatang)).toEqual([9000, 1000]);
    expect(rows.map((r) => r.categoryName)).toEqual(['ก้อนใหญ่', 'ก้อนเล็ก']);
  });

  // 🔴 ข. tiebreak: outflow เท่ากัน → เรียงตาม categoryName คงที่ ไม่ flaky
  test('outflow เท่ากัน → เรียงตาม categoryName (ตัวตัดสินคงที่)', async () => {
    const p = await createPocket(alice, 'p');
    const b = await createCategory(alice, 'ขขข');
    const a = await createCategory(alice, 'กกก');
    await addEntry(alice, p, -5000, { categoryId: b, occurredOn: '2026-05-01' });
    await addEntry(alice, p, -5000, { categoryId: a, occurredOn: '2026-05-02' });

    expect((await summary(alice, WIDE)).rows.map((r) => r.categoryName)).toEqual(['กกก', 'ขขข']);
  });

  // 🔴 ก. ขอบช่วงรวมปลายทั้งสองข้าง (inclusive) — แถว = from และ = to ต้องติด
  test('ช่วง inclusive: occurred_on = from และ = to ติด · นอกช่วงไม่ติด', async () => {
    const p = await createPocket(alice, 'p');
    await addEntry(alice, p, -100, { occurredOn: '2026-02-28' }); // ก่อน from
    await addEntry(alice, p, -200, { occurredOn: '2026-03-01' }); // = from
    await addEntry(alice, p, -400, { occurredOn: '2026-03-31' }); // = to
    await addEntry(alice, p, -800, { occurredOn: '2026-04-01' }); // หลัง to

    const s = await summary(alice, '?from=2026-03-01&to=2026-03-31');
    expect(s.totalOutflowSatang).toBe(600); // 200 + 400 เท่านั้น
  });

  // ไม่ส่ง from/to → เดือนปัจจุบันตามเวลาไทย (currentMonthRange)
  test('ไม่ส่ง from/to → ใช้เดือนปัจจุบันไทย · ตัดรายการนอกเดือน', async () => {
    const { from, to } = currentMonthRange();
    const p = await createPocket(alice, 'p');
    await addEntry(alice, p, -500, { occurredOn: from }); // ในเดือนนี้ (วันที่ 1)
    await addEntry(alice, p, -700, { occurredOn: '2000-01-01' }); // อดีตไกล นอกช่วง

    const s = await summary(alice);
    expect(s.from).toBe(from);
    expect(s.to).toBe(to);
    expect(s.totalOutflowSatang).toBe(500);
  });

  test('400 เมื่อ from > to', async () => {
    const res = await app.request('/api/summary/by-category?from=2026-05-31&to=2026-05-01', as(alice), runEnv);
    expect(res.status).toBe(400);
  });

  test('400 เมื่อส่ง from มาตัวเดียว (ต้องส่งคู่กัน)', async () => {
    const res = await app.request('/api/summary/by-category?from=2026-05-01', as(alice), runEnv);
    expect(res.status).toBe(400);
  });

  test('400 เมื่อ from ไม่ใช่วันจริง', async () => {
    const res = await app.request('/api/summary/by-category?from=2026-02-30&to=2026-03-01', as(alice), runEnv);
    expect(res.status).toBe(400);
  });
});
