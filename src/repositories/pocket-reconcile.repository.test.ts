import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, test } from 'vitest';
import { newId, nowIso } from '../domain/id';
import { getBalanceAsOf } from './pocket.repository';

const db = env.DB;

async function seedUser(id: string): Promise<void> {
  await db
    .prepare('INSERT INTO app_user (id, line_user_id, display_name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, `U-${id}`, 'user', nowIso())
    .run();
}

async function seedPocket(userId: string): Promise<string> {
  const id = newId();
  const now = nowIso();
  await db.batch([
    db.prepare('INSERT INTO pocket (id, name, kind, created_at) VALUES (?, ?, ?, ?)').bind(id, 'p', 'holds_balance', now),
    db
      .prepare("INSERT INTO pocket_member (pocket_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)")
      .bind(id, userId, now)
  ]);
  return id;
}

async function insertEntry(
  pocketId: string,
  userId: string,
  amountSatang: number,
  occurredOn: string,
  opts: { deleted?: boolean } = {}
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO entry (id, pocket_id, created_by_user_id, amount_satang, occurred_on, source, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)`
    )
    .bind(newId(), pocketId, userId, amountSatang, occurredOn, opts.deleted ? nowIso() : null, nowIso())
    .run();
}

let alice: string;
let bob: string;
let alicePocket: string;

beforeEach(async () => {
  alice = newId();
  bob = newId();
  await seedUser(alice);
  await seedUser(bob);
  alicePocket = await seedPocket(alice);
});

describe('getBalanceAsOf — ยอด ณ สิ้นวัน asOfDate', () => {
  // 🔴 หัวใจของทั้งฟีเจอร์: เส้นกระทบยอดเป็นอดีตเสมอ ยอดที่เอาไปเทียบกับธนาคาร
  // จึงต้องเป็นยอด "ณ สิ้นวันนั้น" ไม่รวมรายการของวันหลัง · view pocket_balance
  // รวมทุกแถวไม่มีเงื่อนไขวัน ใช้ไม่ได้ตรงนี้
  test('ไม่รวมรายการที่ occurred_on หลัง asOfDate', async () => {
    await insertEntry(alicePocket, alice, 100000, '2026-03-10');
    await insertEntry(alicePocket, alice, 50000, '2026-03-15');
    await insertEntry(alicePocket, alice, 999999, '2026-03-16'); // หลังเส้น — ต้องไม่นับ

    expect(await getBalanceAsOf(db, alice, alicePocket, '2026-03-15')).toBe(150000);
  });

  // ขอบเขตเป็น inclusive (<=) — รายการที่ลงวันตรงกับ asOfDate นับอยู่ในงวดที่ปิด
  test('รวมรายการที่ occurred_on เท่ากับ asOfDate พอดี', async () => {
    await insertEntry(alicePocket, alice, 100000, '2026-03-15');
    expect(await getBalanceAsOf(db, alice, alicePocket, '2026-03-15')).toBe(100000);
  });

  test('ไม่นับรายการที่ลบแล้ว (deleted_at)', async () => {
    await insertEntry(alicePocket, alice, 100000, '2026-03-10');
    await insertEntry(alicePocket, alice, 70000, '2026-03-10', { deleted: true });
    expect(await getBalanceAsOf(db, alice, alicePocket, '2026-03-15')).toBe(100000);
  });

  test('ไม่มีรายการถึง asOfDate → 0', async () => {
    await insertEntry(alicePocket, alice, 100000, '2026-03-20');
    expect(await getBalanceAsOf(db, alice, alicePocket, '2026-03-15')).toBe(0);
  });

  // 🔴 กันข้อมูลรั่วข้ามผู้ใช้: กรองผ่าน pocket_member เหมือนทุก query — คนที่ไม่ใช่
  // สมาชิกได้ 0 เสมอ ไม่มีทางเห็นยอดจริงของกระเป๋าคนอื่น
  test('ไม่ใช่สมาชิก → 0 ไม่เห็นยอดจริงของกระเป๋าคนอื่น', async () => {
    await insertEntry(alicePocket, alice, 500000, '2026-03-10');
    expect(await getBalanceAsOf(db, bob, alicePocket, '2026-03-15')).toBe(0);
  });
});
