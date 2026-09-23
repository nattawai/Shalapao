import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, test } from 'vitest';
import { ForbiddenError } from '../domain/errors';
import { newId, nowIso } from '../domain/id';
import { applyReconcile, getBalanceAsOf } from './pocket.repository';

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

async function countEntries(): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM entry').first<{ n: number }>();
  return row?.n ?? -1;
}

async function lastReconciledAt(pocketId: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT last_reconciled_at AS d FROM pocket WHERE id = ?')
    .bind(pocketId)
    .first<{ d: string | null }>();
  return row?.d ?? null;
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

describe('applyReconcile — ลงรายการปรับ + ปิดงวด', () => {
  test('diff ≠ 0 → ลงรายการปรับ (source reconcile · วัน = asOfDate) แล้วยอดตรง', async () => {
    await insertEntry(alicePocket, alice, 100000, '2026-03-10');

    const adj = await applyReconcile(db, alice, { pocketId: alicePocket, asOfDate: '2026-03-15', diffSatang: 5000 });

    expect(adj).not.toBeNull();
    expect(adj?.amountSatang).toBe(5000);
    expect(adj?.source).toBe('reconcile');
    expect(adj?.occurredOn).toBe('2026-03-15');
    expect(adj?.createdByUserId).toBe(alice);
    // ยอด ณ วันปิดงวด หลังลงรายการปรับ = ยอดจริงที่ผู้ใช้กรอก (100000 + diff)
    expect(await getBalanceAsOf(db, alice, alicePocket, '2026-03-15')).toBe(105000);
    expect(await lastReconciledAt(alicePocket)).toBe('2026-03-15');
  });

  test('diff = 0 → ไม่ลงรายการปรับ · คืน null · ปิดงวดอย่างเดียว', async () => {
    await insertEntry(alicePocket, alice, 100000, '2026-03-10');
    const before = await countEntries();

    const adj = await applyReconcile(db, alice, { pocketId: alicePocket, asOfDate: '2026-03-15', diffSatang: 0 });

    expect(adj).toBeNull();
    expect(await countEntries()).toBe(before);
    expect(await lastReconciledAt(alicePocket)).toBe('2026-03-15');
  });

  // 🔴 รายการปรับ occurred_on = asOfDate เท่ากับเส้นที่กำลังจะตั้ง — createEntry จะปฏิเสธ
  // ตัวเอง (assertNotReconciled: occurred_on <= เส้น) · applyReconcile จึงต้อง INSERT ดิบ
  // ข้ามด่านนั้น เพราะ reconcile คือผู้เขียนรายการปิดงวดที่ได้รับอนุญาต
  test('รายการปรับลงวันตรงกับเส้นได้ (INSERT ดิบข้าม assertNotReconciled)', async () => {
    const adj = await applyReconcile(db, alice, { pocketId: alicePocket, asOfDate: '2026-03-15', diffSatang: -300 });
    expect(adj?.occurredOn).toBe('2026-03-15');
    expect(await lastReconciledAt(alicePocket)).toBe('2026-03-15');
  });

  // 🔴 batch atomicity: ถ้า UPDATE เส้นพัง (asOfDate ผิดรูปแบบ → trigger 0007 abort)
  // รายการปรับต้องไม่หลงเหลือ · ครึ่ง ๆ กลาง ๆ = ยอดผิดถาวรหรือปรับซ้ำตอน retry
  test('asOfDate ผิดรูปแบบ → ทั้ง batch ล้ม ไม่มีรายการปรับค้าง ไม่ปิดงวด', async () => {
    const before = await countEntries();
    await expect(
      applyReconcile(db, alice, { pocketId: alicePocket, asOfDate: '15/03/2026', diffSatang: 5000 })
    ).rejects.toThrow();
    expect(await countEntries()).toBe(before);
    expect(await lastReconciledAt(alicePocket)).toBeNull();
  });

  // 🔴 INSERT ดิบข้าม auto-filter ทุกตัว — applyReconcile จึงกันสิทธิ์เองเป็น
  // ด่านชดเชย: กระทบยอดกระเป๋าคนอื่น → 403 และไม่มีแถวไหนถูกเขียนลง DB
  test('ไม่ใช่สมาชิก → ForbiddenError ไม่มีรายการเกิด ไม่ปิดงวด', async () => {
    const before = await countEntries();
    await expect(
      applyReconcile(db, bob, { pocketId: alicePocket, asOfDate: '2026-03-15', diffSatang: 5000 })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await countEntries()).toBe(before);
    expect(await lastReconciledAt(alicePocket)).toBeNull();
  });
});
