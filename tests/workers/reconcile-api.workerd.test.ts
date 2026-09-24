import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Env } from '../../src/config';
import { newId, today } from '../../src/domain/id';
import { authMiddleware, type AuthEnv } from '../../src/middleware/auth';
import { upsertUserByLineId } from '../../src/repositories/app-user.repository';
import { entryRoutes } from '../../src/routes/entry.route';
import { httpError } from '../../src/routes/http-error';
import { pocketRoutes } from '../../src/routes/pocket.route';
import { reconcileRoutes } from '../../src/routes/reconcile.route';

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
  app.route('/api/pockets', reconcileRoutes);
  app.route('/api/entries', entryRoutes);
  app.onError(httpError);
  return app;
}

function as(user: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } };
}

async function countEntries(): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM entry').first<{ n: number }>();
  return row?.n ?? -1;
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

async function createChildPocket(user: string, name: string, parentId: string): Promise<string> {
  const res = await app.request('/api/pockets', as(user, { method: 'POST', body: JSON.stringify({ name, parentId }) }), runEnv);
  return ((await res.json()) as { pocket: { id: string } }).pocket.id;
}

async function addEntry(user: string, pocketId: string, amountSatang: number, occurredOn: string): Promise<void> {
  await app.request('/api/entries', as(user, { method: 'POST', body: JSON.stringify({ pocketId, amountSatang, occurredOn }) }), runEnv);
}

async function post(user: string, id: string, body: unknown): Promise<Response> {
  return app.request(`/api/pockets/${id}/reconcile`, as(user, { method: 'POST', body: JSON.stringify(body) }), runEnv);
}

async function preview(user: string, id: string, asOfDate: string): Promise<Response> {
  return app.request(`/api/pockets/${id}/reconcile/preview?asOfDate=${asOfDate}`, as(user), runEnv);
}

describe('POST /api/pockets/:id/reconcile', () => {
  test('happy: diff ≠ 0 → 200 · ลงรายการปรับ · ยอด ณ วันปิดตรงกับยอดจริง', async () => {
    const p = await createPocket(alice, 'เงินเก็บ');
    await addEntry(alice, p, 100000, '2026-03-10');

    const res = await post(alice, p, { actualBalanceSatang: 105000, asOfDate: '2026-03-15' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      expectedSatang: number; actualSatang: number; diffSatang: number;
      adjustmentEntry: { amountSatang: number; source: string; occurredOn: string } | null;
      lastReconciledAt: string;
    };
    expect(body.expectedSatang).toBe(100000);
    expect(body.actualSatang).toBe(105000);
    expect(body.diffSatang).toBe(5000);
    expect(body.adjustmentEntry?.amountSatang).toBe(5000);
    expect(body.adjustmentEntry?.source).toBe('reconcile');
    expect(body.adjustmentEntry?.occurredOn).toBe('2026-03-15');
    expect(body.lastReconciledAt).toBe('2026-03-15');

    // ยอดที่ระบบคิด ณ วันปิด (preview วันเดิม) = ยอดจริงที่กรอก
    const pv = (await (await preview(alice, p, '2026-03-15')).json()) as { expectedSatang: number };
    expect(pv.expectedSatang).toBe(105000);
  });

  test('diff = 0 → 200 · ไม่มีรายการปรับ (adjustmentEntry = null)', async () => {
    const p = await createPocket(alice, 'p');
    await addEntry(alice, p, 100000, '2026-03-10');
    const res = await post(alice, p, { actualBalanceSatang: 100000, asOfDate: '2026-03-15' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { adjustmentEntry: unknown }).adjustmentEntry).toBeNull();
  });

  test('400 เมื่อ asOfDate = วันนี้ (ยอดสิ้นวันยังไม่นิ่ง)', async () => {
    const p = await createPocket(alice, 'p');
    expect((await post(alice, p, { actualBalanceSatang: 1, asOfDate: today() })).status).toBe(400);
  });

  test('400 เมื่อ asOfDate เป็นอนาคต', async () => {
    const p = await createPocket(alice, 'p');
    expect((await post(alice, p, { actualBalanceSatang: 1, asOfDate: '2999-01-01' })).status).toBe(400);
  });

  test("400 เมื่อ asOfDate ไม่ใช่วันจริง ('2026-99-99')", async () => {
    const p = await createPocket(alice, 'p');
    expect((await post(alice, p, { actualBalanceSatang: 1, asOfDate: '2026-99-99' })).status).toBe(400);
  });

  test('400 เมื่อ actualBalanceSatang เป็นทศนิยม', async () => {
    const p = await createPocket(alice, 'p');
    expect((await post(alice, p, { actualBalanceSatang: 100.5, asOfDate: '2026-03-15' })).status).toBe(400);
  });

  test('409 เมื่อ asOfDate ก่อนงวดที่ปิดไปแล้ว', async () => {
    const p = await createPocket(alice, 'p');
    await post(alice, p, { actualBalanceSatang: 0, asOfDate: '2026-03-15' });
    const res = await post(alice, p, { actualBalanceSatang: 0, asOfDate: '2026-03-14' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('reconcile_reopen');
  });

  // 🔴 พิสูจน์ว่าวงจรปิดจริง: หลังกระทบยอดถึง 2026-03-15 การลงรายการวัน ≤ เส้น → 409
  test('หลังกระทบยอด: ลงรายการในงวดที่ปิดแล้ว → 409 (วงจรปิดจริง)', async () => {
    const p = await createPocket(alice, 'p');
    await post(alice, p, { actualBalanceSatang: 100000, asOfDate: '2026-03-15' });
    const res = await app.request(
      '/api/entries',
      as(alice, { method: 'POST', body: JSON.stringify({ pocketId: p, amountSatang: 100, occurredOn: '2026-03-15' }) }),
      runEnv
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('reconciled_period');
  });

  // 🔴 กระเป๋าคนอื่น → 403 และไม่มีแถวไหนถูกเขียนลง DB (เงื่อนไข ข.4 — INSERT ดิบข้าม filter)
  test('403 เมื่อกระทบยอดกระเป๋าของผู้ใช้อื่น · ไม่มีรายการเกิด', async () => {
    const bobPocket = await createPocket(bob, 'ของบ๊อบ');
    const before = await countEntries();
    const res = await post(alice, bobPocket, { actualBalanceSatang: 999999, asOfDate: '2026-03-15' });
    expect(res.status).toBe(403);
    expect(await countEntries()).toBe(before);
  });
});

describe('GET /api/pockets/:id/reconcile/preview — อ่านอย่างเดียว', () => {
  test('คืนยอดที่ระบบคิด · actual/diff = null · ไม่เขียนอะไรลง DB', async () => {
    const p = await createPocket(alice, 'p');
    await addEntry(alice, p, 80000, '2026-03-10');
    const before = await countEntries();

    const res = await preview(alice, p, '2026-03-15');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { expectedSatang: number; actualSatang: null; diffSatang: null };
    expect(body.expectedSatang).toBe(80000);
    expect(body.actualSatang).toBeNull();
    expect(body.diffSatang).toBeNull();

    expect(await countEntries()).toBe(before); // preview เขียนอะไรไม่ได้เลย
  });

  test('403 เมื่อ preview กระเป๋าของผู้ใช้อื่น', async () => {
    const bobPocket = await createPocket(bob, 'ของบ๊อบ');
    expect((await preview(alice, bobPocket, '2026-03-15')).status).toBe(403);
  });
});

// reconcile เทียบ rollup (ยอดตัวเอง + ลูกทุกชั้น) เสมอ — กระเป๋าแม่เช็คยอดรวมกับธนาคาร
// รายการปรับส่วนต่างลงที่แม่เอง (ยอดตัวเองของแม่ = เงินที่ยังไม่ได้แบ่งเข้าซองลูก)
describe('reconcile ระดับ rollup', () => {
  test('แม่ไม่มีเงินเอง ลูกถือ 3,000 → preview/expected = 3,000 · ปรับส่วนต่างลงที่แม่', async () => {
    const parent = await createPocket(alice, 'Make');
    const child = await createChildPocket(alice, 'Mobile', parent);
    await addEntry(alice, child, 300000, '2026-03-10');

    const pv = (await (await preview(alice, parent, '2026-03-15')).json()) as { expectedSatang: number };
    expect(pv.expectedSatang).toBe(300000); // rollup ของแม่ = ยอดลูก

    // ธนาคารมี 3,200 → diff +200 ลงเป็นรายการปรับที่ "แม่"
    const res = await post(alice, parent, { actualBalanceSatang: 320000, asOfDate: '2026-03-15' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { expectedSatang: number; diffSatang: number; adjustmentEntry: { amountSatang: number; occurredOn: string } | null };
    expect(body.expectedSatang).toBe(300000);
    expect(body.diffSatang).toBe(20000);
    expect(body.adjustmentEntry?.amountSatang).toBe(20000);

    const list = (await (await app.request(`/api/pockets/${parent}/entries`, as(alice), runEnv)).json()) as { entries: { amountSatang: number; source: string }[] };
    expect(list.entries.some((e) => e.source === 'reconcile' && e.amountSatang === 20000)).toBe(true);
  });

  // 🔴 หลังกระทบยอดแม่ ลงรายการย้อนหลังในลูก → 409 (ไม่งั้น rollup ของแม่เพี้ยนเงียบ ๆ)
  test('หลังกระทบยอดแม่: ลงรายการย้อนหลังในลูก → 409', async () => {
    const parent = await createPocket(alice, 'Make');
    const child = await createChildPocket(alice, 'Mobile', parent);
    await post(alice, parent, { actualBalanceSatang: 0, asOfDate: '2026-03-15' });
    const res = await app.request(
      '/api/entries',
      as(alice, { method: 'POST', body: JSON.stringify({ pocketId: child, amountSatang: 100, occurredOn: '2026-03-15' }) }),
      runEnv
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('reconciled_period');
  });
});

// 🔴 เส้นทางกู้คืนจากการกรอกยอดผิด — เคสเดียวที่ INSERT ดิบจำเป็นจริง:
// กระทบยอดผิดครั้งแรก แล้วแก้โดยกระทบยอด "วันเดิม" ซ้ำ (asOfDate == เส้นเดิม)
describe('กระทบยอดวันเดิมซ้ำด้วยยอดที่แก้แล้ว', () => {
  test('เพิ่ม adjustment อีกใบ · ยอดสุดท้ายตรงกับยอดจริงที่แก้แล้ว', async () => {
    const p = await createPocket(alice, 'p');
    // กรอกผิดครั้งแรก: บอกว่าธนาคารมี 90,000
    const first = await post(alice, p, { actualBalanceSatang: 90000, asOfDate: '2026-03-15' });
    expect(first.status).toBe(200);

    // ที่จริงธนาคารมี 100,000 → กระทบยอดวันเดิมซ้ำเพื่อแก้
    const fix = await post(alice, p, { actualBalanceSatang: 100000, asOfDate: '2026-03-15' });
    expect(fix.status).toBe(200);
    const body = (await fix.json()) as { diffSatang: number; adjustmentEntry: { amountSatang: number } | null };
    expect(body.diffSatang).toBe(10000);
    expect(body.adjustmentEntry?.amountSatang).toBe(10000);

    // ยอด ณ วันปิด = ยอดจริงที่แก้แล้ว (90,000 + 10,000)
    const pv = (await (await preview(alice, p, '2026-03-15')).json()) as { expectedSatang: number };
    expect(pv.expectedSatang).toBe(100000);
  });
});
