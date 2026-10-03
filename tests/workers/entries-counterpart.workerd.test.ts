import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Env } from '../../src/config';
import { newId, nowIso } from '../../src/domain/id';
import { authMiddleware, type AuthEnv } from '../../src/middleware/auth';
import { upsertUserByLineId } from '../../src/repositories/app-user.repository';
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

async function createPocket(user: string, name: string, parentId?: string): Promise<string> {
  const body = parentId !== undefined ? { name, parentId } : { name };
  const res = await app.request('/api/pockets', as(user, { method: 'POST', body: JSON.stringify(body) }), runEnv);
  return ((await res.json()) as { pocket: { id: string } }).pocket.id;
}

async function transfer(user: string, from: string, to: string, amountSatang: number): Promise<void> {
  await app.request('/api/transfers', as(user, { method: 'POST', body: JSON.stringify({ fromPocketId: from, toPocketId: to, amountSatang }) }), runEnv);
}

type EntryRow = { amountSatang: number; counterpartPocketId: string | null; counterpartPocketName: string | null; pocketName?: string };

async function listEntries(user: string, pocketId: string, query = ''): Promise<EntryRow[]> {
  const res = await app.request(`/api/pockets/${pocketId}/entries${query}`, as(user), runEnv);
  expect(res.status).toBe(200);
  return ((await res.json()) as { entries: EntryRow[] }).entries;
}

function first(rows: EntryRow[]): EntryRow {
  expect(rows.length).toBeGreaterThan(0);
  return rows[0] as EntryRow;
}

describe('counterpart บน GET /api/pockets/:id/entries (โหมดปกติ)', () => {
  test('โยก A→B: เดินบัญชี A เห็นคู่เป็น B · เดินบัญชี B เห็นคู่เป็น A', async () => {
    const a = await createPocket(alice, 'กระเป๋า A');
    const b = await createPocket(alice, 'กระเป๋า B');
    await transfer(alice, a, b, 1000);

    const aRow = first(await listEntries(alice, a));
    expect(aRow.amountSatang).toBe(-1000);
    expect(aRow.counterpartPocketId).toBe(b);
    expect(aRow.counterpartPocketName).toBe('กระเป๋า B');

    const bRow = first(await listEntries(alice, b));
    expect(bRow.amountSatang).toBe(1000);
    expect(bRow.counterpartPocketId).toBe(a);
    expect(bRow.counterpartPocketName).toBe('กระเป๋า A');
  });

  test('เปลี่ยนชื่อ B แล้วเดินบัญชี A เห็นชื่อใหม่ทันที (ไม่เก็บชื่อเก่า)', async () => {
    const a = await createPocket(alice, 'A');
    const b = await createPocket(alice, 'B');
    await transfer(alice, a, b, 1000);
    await app.request(`/api/pockets/${b}`, as(alice, { method: 'PATCH', body: JSON.stringify({ name: 'B ใหม่' }) }), runEnv);

    const aRow = first(await listEntries(alice, a));
    expect(aRow.counterpartPocketName).toBe('B ใหม่');
  });

  test('รายการธรรมดา → counterpart ทั้งคู่เป็น null (ไม่ใช่สตริงว่าง)', async () => {
    const p = await createPocket(alice, 'p');
    await app.request('/api/entries', as(alice, { method: 'POST', body: JSON.stringify({ pocketId: p, amountSatang: 50000 }) }), runEnv);

    const row = first(await listEntries(alice, p));
    expect(row.counterpartPocketId).toBeNull();
    expect(row.counterpartPocketName).toBeNull();
  });

  // 🔴 กันรั่วข้ามผู้ใช้: ขาคู่อยู่ในกระเป๋าที่ Alice ไม่ได้เป็นสมาชิก → ทั้งคู่ null (ชื่อ+id ห้ามหลุด)
  // จำลองสถานการณ์กระเป๋าร่วม v3 ด้วย SQL ตรง ๆ: transfer หนึ่งที่สองขาอยู่คนละเจ้าของ —
  // API ปกติสร้างไม่ได้ (createTransfer บังคับเป็นสมาชิกทั้งสองขา) แต่พอมีกระเป๋าร่วมจะเกิดได้
  test('ขาคู่อยู่ในกระเป๋าที่ผู้ใช้ไม่ได้เป็นสมาชิก → counterpart เป็น null', async () => {
    const aPocket = await createPocket(alice, 'ของอลิซ');
    const bPocket = await createPocket(bob, 'ของบ๊อบ');
    const tid = newId();
    const now = nowIso();
    const insertLeg = (pocketId: string, amount: number) =>
      db
        .prepare(
          `INSERT INTO entry (id, pocket_id, created_by_user_id, amount_satang, occurred_on, source, transfer_id, created_at)
           VALUES (?, ?, (SELECT user_id FROM pocket_member WHERE pocket_id = ? AND left_at IS NULL LIMIT 1), ?, ?, 'manual', ?, ?)`
        )
        .bind(newId(), pocketId, pocketId, amount, '2026-05-10', tid, now);
    await db.batch([insertLeg(aPocket, -1000), insertLeg(bPocket, 1000)]);

    const aRow = first(await listEntries(alice, aPocket));
    expect(aRow.amountSatang).toBe(-1000); // เห็นขาของตัวเองตามปกติ
    expect(aRow.counterpartPocketId).toBeNull();
    expect(aRow.counterpartPocketName).toBeNull();
  });
});

describe('counterpart บนโหมด subtree (?subtree=1)', () => {
  // โยกออกนอกสาขา: ลูก C ใต้ P โยกไปกระเป๋า S (นอกสาขา) — subtree ของ P เห็นแค่ขาของ C
  // ขาคู่ไม่อยู่ในผลลัพธ์ จึงต้องมี counterpart บอกว่าคู่กับ S
  test('subtree=1 คืน counterpart ของขาโยกที่ออกนอกสาขา', async () => {
    const parent = await createPocket(alice, 'แม่');
    const child = await createPocket(alice, 'ลูก', parent);
    const sibling = await createPocket(alice, 'พี่น้อง');
    await transfer(alice, child, sibling, 2000);

    const rows = await listEntries(alice, parent, '?subtree=1');
    const leg = rows.find((r) => r.amountSatang === -2000);
    expect(leg?.pocketName).toBe('ลูก');
    expect(leg?.counterpartPocketId).toBe(sibling);
    expect(leg?.counterpartPocketName).toBe('พี่น้อง');
  });

  test('subtree=1 รายการธรรมดา → counterpart null', async () => {
    const p = await createPocket(alice, 'p');
    await app.request('/api/entries', as(alice, { method: 'POST', body: JSON.stringify({ pocketId: p, amountSatang: 100 }) }), runEnv);
    const row = first(await listEntries(alice, p, "?subtree=1"));
    expect(row.counterpartPocketId).toBeNull();
    expect(row.counterpartPocketName).toBeNull();
  });
});
