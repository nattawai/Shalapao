import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, test } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors';
import { newId, nowIso, today } from '../domain/id';
import { createEntry, createTransfer, deleteEntry, getEntry, listEntries } from './entry.repository';

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
    db
      .prepare('INSERT INTO pocket (id, name, kind, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, 'p', 'holds_balance', now),
    db
      .prepare("INSERT INTO pocket_member (pocket_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)")
      .bind(id, userId, now)
  ]);
  return id;
}

async function seedCategory(userId: string): Promise<string> {
  const id = newId();
  await db
    .prepare('INSERT INTO category (id, user_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, userId, 'cat', nowIso())
    .run();
  return id;
}

async function countEntries(): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM entry').first<{ n: number }>();
  return row?.n ?? -1;
}

async function balanceOf(pocketId: string): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(balance_satang, 0) AS b FROM pocket_balance WHERE pocket_id = ?').bind(pocketId).first<{ b: number }>();
  return row?.b ?? 0;
}

async function reconcilePocket(pocketId: string, date: string): Promise<void> {
  await db.prepare('UPDATE pocket SET last_reconciled_at = ? WHERE id = ?').bind(date, pocketId).run();
}

async function seedChildPocket(userId: string, parentId: string): Promise<string> {
  const id = newId();
  const now = nowIso();
  await db.batch([
    db.prepare('INSERT INTO pocket (id, parent_id, name, kind, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, parentId, 'child', 'holds_balance', now),
    db.prepare("INSERT INTO pocket_member (pocket_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").bind(id, userId, now)
  ]);
  return id;
}

let alice: string;
let bob: string;
let alicePocket: string;
let bobPocket: string;

beforeEach(async () => {
  alice = newId();
  bob = newId();
  await seedUser(alice);
  await seedUser(bob);
  alicePocket = await seedPocket(alice);
  bobPocket = await seedPocket(bob);
});

describe('createEntry / getEntry', () => {
  test('สมาชิกเพิ่มรายการแล้วอ่านกลับมาได้ครบ', async () => {
    const e = await createEntry(db, alice, {
      pocketId: alicePocket,
      amountSatang: -6100,
      note: 'ค่ากาแฟ'
    });

    expect(e.amountSatang).toBe(-6100);
    expect(e.source).toBe('manual');
    expect(e.occurredOn).toBe(today());
    expect(e.createdByUserId).toBe(alice);

    const fetched = await getEntry(db, alice, e.id);
    expect(fetched?.note).toBe('ค่ากาแฟ');
  });

  test('ไม่ใช่สมาชิก → เพิ่มรายการไม่ได้ ไม่มีแถวเกิด', async () => {
    const before = await countEntries();
    await expect(
      createEntry(db, alice, { pocketId: bobPocket, amountSatang: 100 })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await countEntries()).toBe(before);
  });

  // 🔴 categoryId รั่วแบบเดียวกับ createPocket — ใส่หมวดของคนอื่นไม่ได้
  test('categoryId เป็นของคนอื่น → ปฏิเสธ ไม่มีแถวเกิด', async () => {
    const bobsCat = await seedCategory(bob);
    const before = await countEntries();
    await expect(
      createEntry(db, alice, { pocketId: alicePocket, amountSatang: 100, categoryId: bobsCat })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await countEntries()).toBe(before);
  });
});

// ข้อตกลงข้อ 6: ห้ามลงรายการทับงวดที่กระทบยอดแล้ว · เส้น (last_reconciled_at)
// เป็นวันที่ปิดงวดแล้วเสมอ (ห้ามวันนี้/อนาคต — reconcile.service กันตอนตั้งเส้น)
// occurred_on เท่ากับเส้นพอดี = อยู่ในงวดที่ยืนยันแล้ว → ปฏิเสธ (เกณฑ์คือ <=)
describe('createEntry — กันลงรายการในงวดที่กระทบยอดแล้ว', () => {
  test('occurred_on หลังเส้น → ผ่าน', async () => {
    await reconcilePocket(alicePocket, '2026-03-15');
    const e = await createEntry(db, alice, { pocketId: alicePocket, amountSatang: 100, occurredOn: '2026-03-16' });
    expect(e.occurredOn).toBe('2026-03-16');
  });

  test('occurred_on เท่ากับเส้นพอดี → ปฏิเสธ ไม่มีแถวเกิด', async () => {
    await reconcilePocket(alicePocket, '2026-03-15');
    const before = await countEntries();
    await expect(
      createEntry(db, alice, { pocketId: alicePocket, amountSatang: 100, occurredOn: '2026-03-15' })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await countEntries()).toBe(before);
  });

  test('occurred_on ก่อนเส้น → ปฏิเสธ ไม่มีแถวเกิด', async () => {
    await reconcilePocket(alicePocket, '2026-03-15');
    const before = await countEntries();
    await expect(
      createEntry(db, alice, { pocketId: alicePocket, amountSatang: 100, occurredOn: '2026-03-14' })
    ).rejects.toThrow();
    expect(await countEntries()).toBe(before);
  });

  test('กระเป๋าที่ยังไม่เคยกระทบยอด (เส้น = NULL) → ลงย้อนหลังได้', async () => {
    const e = await createEntry(db, alice, { pocketId: alicePocket, amountSatang: 100, occurredOn: '2020-01-01' });
    expect(e.occurredOn).toBe('2020-01-01');
  });
});

// reconcile ทำงานระดับ rollup (ยอดแม่ = ตัวเอง + ลูก) · ถ้าลงรายการย้อนหลังในลูก
// ได้ทั้งที่แม่ปิดงวดไปแล้ว rollup ของแม่ ณ วันปิดจะเปลี่ยน = กระทบยอดเป็นโมฆะเงียบ ๆ
// ด่านจึงต้องดูเส้นของกระเป๋านี้ + แม่ทุกชั้น แล้วใช้เส้นที่ใหม่ที่สุด
describe('createEntry — กันลงรายการทับงวดที่แม่กระทบยอดแล้ว', () => {
  test('แม่กระทบยอดถึง 2026-03-15 → ลงย้อนหลังในลูก → ปฏิเสธ ไม่มีแถวเกิด', async () => {
    const child = await seedChildPocket(alice, alicePocket);
    await reconcilePocket(alicePocket, '2026-03-15');
    const before = await countEntries();
    await expect(
      createEntry(db, alice, { pocketId: child, amountSatang: 100, occurredOn: '2026-03-15' })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await countEntries()).toBe(before);
  });

  test('ลูกลงรายการหลังเส้นของแม่ → ผ่าน', async () => {
    const child = await seedChildPocket(alice, alicePocket);
    await reconcilePocket(alicePocket, '2026-03-15');
    const e = await createEntry(db, alice, { pocketId: child, amountSatang: 100, occurredOn: '2026-03-16' });
    expect(e.occurredOn).toBe('2026-03-16');
  });

  // ใช้เส้นที่ใหม่ที่สุดในสายเลือด: ลูกปิดถึง 03-20 แม่ปิดถึง 03-10 → เกณฑ์คือ 03-20
  test('ใช้เส้นที่ใหม่ที่สุดระหว่างลูกกับแม่', async () => {
    const child = await seedChildPocket(alice, alicePocket);
    await reconcilePocket(alicePocket, '2026-03-10');
    await reconcilePocket(child, '2026-03-20');
    await expect(
      createEntry(db, alice, { pocketId: child, amountSatang: 100, occurredOn: '2026-03-18' })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('createTransfer — กันโยกเข้างวดที่กระทบยอดแล้ว (เช็คทั้งสองกระเป๋า)', () => {
  test('ต้นทางกระทบยอดถึงวันโอนแล้ว → ปฏิเสธ ไม่มีขาไหนเกิด', async () => {
    const dest = await seedPocket(alice);
    await reconcilePocket(alicePocket, '2026-03-15');
    const before = await countEntries();
    await expect(
      createTransfer(db, alice, { fromPocketId: alicePocket, toPocketId: dest, amountSatang: 100, occurredOn: '2026-03-15' })
    ).rejects.toThrow();
    expect(await countEntries()).toBe(before);
  });

  // 🔴 พิสูจน์ว่าเช็ค "ทั้งสอง" กระเป๋า ไม่ใช่แค่ต้นทาง: วางเส้นไว้ที่ปลายทางเท่านั้น
  test('ปลายทางกระทบยอดถึงวันโอนแล้ว → ปฏิเสธ ไม่มีขาไหนเกิด', async () => {
    const dest = await seedPocket(alice);
    await reconcilePocket(dest, '2026-03-15');
    const before = await countEntries();
    await expect(
      createTransfer(db, alice, { fromPocketId: alicePocket, toPocketId: dest, amountSatang: 100, occurredOn: '2026-03-15' })
    ).rejects.toThrow();
    expect(await countEntries()).toBe(before);
  });

  test('เส้นทั้งสองกระเป๋าอยู่ก่อนวันโอน → ผ่าน', async () => {
    const dest = await seedPocket(alice);
    await reconcilePocket(alicePocket, '2026-03-15');
    await reconcilePocket(dest, '2026-03-15');
    const { outflow, inflow } = await createTransfer(db, alice, {
      fromPocketId: alicePocket,
      toPocketId: dest,
      amountSatang: 100,
      occurredOn: '2026-03-16'
    });
    expect(outflow.amountSatang).toBe(-100);
    expect(inflow.amountSatang).toBe(100);
  });
});

// v0 ลบ = soft delete (deleted_at) เท่านั้น ไม่ทำ reversal · ลบได้เฉพาะงวดที่ยังไม่ปิด
describe('deleteEntry', () => {
  test('ลบรายการในงวดที่ยังเปิด → สำเร็จ · ยอดลดลงตามจริง · ไม่โผล่ในลิสต์', async () => {
    const income = await createEntry(db, alice, { pocketId: alicePocket, amountSatang: 50000, occurredOn: '2026-03-10' });
    const wrong = await createEntry(db, alice, { pocketId: alicePocket, amountSatang: -99900, occurredOn: '2026-03-11' });
    expect(await balanceOf(alicePocket)).toBe(50000 - 99900);

    await deleteEntry(db, alice, wrong.id);

    expect(await balanceOf(alicePocket)).toBe(50000);
    const list = await listEntries(db, alice, alicePocket);
    expect(list.map((e) => e.id)).toEqual([income.id]);
    expect(await getEntry(db, alice, wrong.id)).toBeNull();
  });

  test('ลบรายการในงวดที่ปิดแล้ว → 409', async () => {
    const e = await createEntry(db, alice, { pocketId: alicePocket, amountSatang: 100, occurredOn: '2026-03-10' });
    await reconcilePocket(alicePocket, '2026-03-15');
    await expect(deleteEntry(db, alice, e.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await getEntry(db, alice, e.id)).not.toBeNull(); // ยังอยู่
  });

  test('ลบรายการในลูกที่งวดของแม่ปิดแล้ว → 409 (ไล่แม่)', async () => {
    const child = await seedChildPocket(alice, alicePocket);
    const e = await createEntry(db, alice, { pocketId: child, amountSatang: 100, occurredOn: '2026-03-10' });
    await reconcilePocket(alicePocket, '2026-03-15');
    await expect(deleteEntry(db, alice, e.id)).rejects.toBeInstanceOf(ConflictError);
  });

  test('ลบรายการที่ลบไปแล้ว → NotFoundError', async () => {
    const e = await createEntry(db, alice, { pocketId: alicePocket, amountSatang: 100 });
    await deleteEntry(db, alice, e.id);
    await expect(deleteEntry(db, alice, e.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  test('ลบรายการของผู้ใช้อื่น → ForbiddenError · แถวยังอยู่ใน DB', async () => {
    const e = await createEntry(db, bob, { pocketId: bobPocket, amountSatang: 100 });
    await expect(deleteEntry(db, alice, e.id)).rejects.toBeInstanceOf(ForbiddenError);
    const row = await db.prepare('SELECT deleted_at FROM entry WHERE id = ?').bind(e.id).first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).toBeNull();
  });

  // 🔴 ขาโยกเงินต้องลบพร้อมกันทั้งคู่ ไม่งั้นยอดสองกระเป๋าไม่บาลานซ์
  test('ลบขาโยกเงิน → ทั้งสองขาถูกลบ · ยอดสองกระเป๋ากลับไปเท่าก่อนโยก', async () => {
    const dest = await seedPocket(alice);
    await createEntry(db, alice, { pocketId: alicePocket, amountSatang: 100000, occurredOn: '2026-03-01' });
    const { outflow } = await createTransfer(db, alice, { fromPocketId: alicePocket, toPocketId: dest, amountSatang: 30000, occurredOn: '2026-03-02' });
    expect(await balanceOf(alicePocket)).toBe(70000);
    expect(await balanceOf(dest)).toBe(30000);

    await deleteEntry(db, alice, outflow.id);

    expect(await balanceOf(alicePocket)).toBe(100000);
    expect(await balanceOf(dest)).toBe(0);
    expect(await listEntries(db, alice, dest)).toHaveLength(0);
  });

  test('ลบขาโยกเงินที่ปลายทางอยู่ในงวดปิดแล้ว → 409 · ไม่มีขาไหนถูกลบ', async () => {
    const dest = await seedPocket(alice);
    const { outflow } = await createTransfer(db, alice, { fromPocketId: alicePocket, toPocketId: dest, amountSatang: 30000, occurredOn: '2026-03-02' });
    await reconcilePocket(dest, '2026-03-15'); // ปลายทางปิดงวดคลุมวันโอน
    await expect(deleteEntry(db, alice, outflow.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await balanceOf(alicePocket)).toBe(-30000);
    expect(await balanceOf(dest)).toBe(30000); // ทั้งสองขายังอยู่
  });
});

describe('listEntries', () => {
  test('เรียงตามวันแล้ว id · ไม่เอาที่ลบแล้ว', async () => {
    await createEntry(db, alice, { pocketId: alicePocket, amountSatang: 100, occurredOn: '2026-03-02' });
    await createEntry(db, alice, { pocketId: alicePocket, amountSatang: 200, occurredOn: '2026-03-01' });
    const deleted = await createEntry(db, alice, { pocketId: alicePocket, amountSatang: 300, occurredOn: '2026-03-03' });
    await db.prepare('UPDATE entry SET deleted_at = ? WHERE id = ?').bind(nowIso(), deleted.id).run();

    const list = await listEntries(db, alice, alicePocket);
    expect(list.map((e) => e.amountSatang)).toEqual([200, 100]);
  });

  // 🔴 กันข้อมูลรั่วข้ามผู้ใช้
  test('ไม่ใช่สมาชิก → listEntries คืนว่าง ไม่เห็นรายการคนอื่น', async () => {
    await createEntry(db, bob, { pocketId: bobPocket, amountSatang: 999 });
    expect(await listEntries(db, alice, bobPocket)).toHaveLength(0);
  });

  // 🔴 กันข้อมูลรั่วข้ามผู้ใช้
  test('getEntry ของกระเป๋าคนอื่น → null', async () => {
    const e = await createEntry(db, bob, { pocketId: bobPocket, amountSatang: 999 });
    expect(await getEntry(db, alice, e.id)).toBeNull();
  });
});

describe('createTransfer — โยกเงินสองขาใน batch เดียว', () => {
  test('สร้างสองขา ยอดตรงข้าม ผูก transferId เดียวกัน', async () => {
    const dest = await seedPocket(alice);
    const { outflow, inflow } = await createTransfer(db, alice, {
      fromPocketId: alicePocket,
      toPocketId: dest,
      amountSatang: 50000
    });

    expect(outflow.amountSatang).toBe(-50000);
    expect(inflow.amountSatang).toBe(50000);
    expect(outflow.transferId).toBe(inflow.transferId);
    expect(outflow.transferId).toBeTruthy();
    expect(outflow.pocketId).toBe(alicePocket);
    expect(inflow.pocketId).toBe(dest);
  });

  // 🔴 โยกเข้ากระเป๋าคนอื่นไม่ได้ · และต้อง atomic — ห้ามมีขาเดียวค้าง
  test('ปลายทางเป็นกระเป๋าคนอื่น → ปฏิเสธ ไม่มีขาไหนถูกสร้าง', async () => {
    const before = await countEntries();
    await expect(
      createTransfer(db, alice, {
        fromPocketId: alicePocket,
        toPocketId: bobPocket,
        amountSatang: 50000
      })
    ).rejects.toThrow();
    expect(await countEntries()).toBe(before);
  });
});

// ทิศทางกำหนดด้วยต้นทาง/ปลายทาง ไม่ใช่เครื่องหมาย · DB บังคับแค่ amount <> 0
// ยอดติดลบจึงไหลย้อน (−(−500) = +500 เข้าต้นทาง) โดย DB ไม่ทัก · โยกเข้าตัวเอง
// สร้างสองแถวในกระเป๋าเดียว = ledger ขยะ · ทั้งคู่ต้องกันที่ชั้นนี้ก่อนถึง batch
describe('createTransfer — ปฏิเสธ input ที่ทำ ledger พัง', () => {
  test('amountSatang ติดลบ → ปฏิเสธ ไม่มีขาไหนเกิด', async () => {
    const dest = await seedPocket(alice);
    const before = await countEntries();
    await expect(
      createTransfer(db, alice, { fromPocketId: alicePocket, toPocketId: dest, amountSatang: -500 })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await countEntries()).toBe(before);
  });

  test('amountSatang เป็น 0 → ปฏิเสธ', async () => {
    const dest = await seedPocket(alice);
    await expect(
      createTransfer(db, alice, { fromPocketId: alicePocket, toPocketId: dest, amountSatang: 0 })
    ).rejects.toThrow();
  });

  test('โยกเข้ากระเป๋าตัวเอง (from === to) → ปฏิเสธ ไม่มีแถวเกิด', async () => {
    const before = await countEntries();
    await expect(
      createTransfer(db, alice, { fromPocketId: alicePocket, toPocketId: alicePocket, amountSatang: 100 })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await countEntries()).toBe(before);
  });
});
