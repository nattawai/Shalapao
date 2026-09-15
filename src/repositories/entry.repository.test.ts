import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, test } from 'vitest';
import { newId, nowIso, today } from '../domain/id';
import { createEntry, createTransfer, getEntry, listEntries } from './entry.repository';

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
    ).rejects.toThrow();
    expect(await countEntries()).toBe(before);
  });

  // 🔴 categoryId รั่วแบบเดียวกับ createPocket — ใส่หมวดของคนอื่นไม่ได้
  test('categoryId เป็นของคนอื่น → ปฏิเสธ ไม่มีแถวเกิด', async () => {
    const bobsCat = await seedCategory(bob);
    const before = await countEntries();
    await expect(
      createEntry(db, alice, { pocketId: alicePocket, amountSatang: 100, categoryId: bobsCat })
    ).rejects.toThrow();
    expect(await countEntries()).toBe(before);
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
