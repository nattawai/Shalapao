import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, test } from 'vitest';
import { newId, nowIso, today } from '../domain/id';
import { createPocket, getPocket, listPockets } from './pocket.repository';

const db = env.DB;

async function seedUser(id: string, name: string): Promise<void> {
  await db
    .prepare('INSERT INTO app_user (id, line_user_id, display_name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, `U-${id}`, name, nowIso())
    .run();
}

async function insertEntry(pocketId: string, userId: string, amountSatang: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO entry (id, pocket_id, created_by_user_id, amount_satang, occurred_on, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'manual', ?)`
    )
    .bind(newId(), pocketId, userId, amountSatang, today(), nowIso())
    .run();
}

// ทุก test เริ่มจากฐานว่าง (isolated storage rollback ให้) จึง seed ใหม่ทุกครั้ง
let alice: string;
let bob: string;

beforeEach(async () => {
  alice = newId();
  bob = newId();
  await seedUser(alice, 'Alice');
  await seedUser(bob, 'Bob');
});

describe('createPocket', () => {
  test('สร้างกระเป๋าแล้วเจ้าของอ่านกลับมาได้ · ยอดเริ่มที่ 0', async () => {
    const created = await createPocket(db, alice, { name: 'เงินเก็บ', kind: 'holds_balance' });

    expect(created.id).toBeTruthy();
    expect(created.name).toBe('เงินเก็บ');
    expect(created.kind).toBe('holds_balance');
    expect(created.role).toBe('owner');
    expect(created.balanceSatang).toBe(0);

    const fetched = await getPocket(db, alice, created.id);
    expect(fetched?.id).toBe(created.id);
  });

  test('บันทึกความเป็นเจ้าของผ่าน pocket_member ไม่ใช่คอลัมน์บน pocket', async () => {
    const created = await createPocket(db, alice, { name: 'ค่ากิน', kind: 'holds_balance' });

    const member = await db
      .prepare('SELECT role FROM pocket_member WHERE pocket_id = ? AND user_id = ? AND left_at IS NULL')
      .bind(created.id, alice)
      .first<{ role: string }>();
    expect(member?.role).toBe('owner');
  });
});

describe('getPocket / listPockets — ยอดมาจาก view', () => {
  test('balanceSatang เท่ากับผลรวม entry เสมอ ไม่ได้คำนวณเองในโค้ด', async () => {
    const p = await createPocket(db, alice, { name: 'บิล', kind: 'holds_balance' });
    await insertEntry(p.id, alice, 350000);
    await insertEntry(p.id, alice, -6100);

    const fetched = await getPocket(db, alice, p.id);
    expect(fetched?.balanceSatang).toBe(343900);
  });

  test('listPockets คืนเฉพาะกระเป๋าที่ผู้ใช้เป็นสมาชิก active', async () => {
    await createPocket(db, alice, { name: 'A1', kind: 'holds_balance' });
    await createPocket(db, alice, { name: 'A2', kind: 'holds_balance' });
    await createPocket(db, bob, { name: 'B1', kind: 'holds_balance' });

    const aliceList = await listPockets(db, alice);
    expect(aliceList.map((p) => p.name).sort()).toEqual(['A1', 'A2']);
  });

  test('สมาชิกที่ออกแล้ว (left_at) มองไม่เห็นกระเป๋าอีก', async () => {
    const p = await createPocket(db, alice, { name: 'กระเป๋าร่วม', kind: 'holds_balance' });
    await db
      .prepare('UPDATE pocket_member SET left_at = ? WHERE pocket_id = ? AND user_id = ?')
      .bind(nowIso(), p.id, alice)
      .run();

    expect(await getPocket(db, alice, p.id)).toBeNull();
    expect(await listPockets(db, alice)).toHaveLength(0);
  });
});

// 🔴 ข้อ 2.3 — ห้ามลบ ห้าม skip
describe('กันข้อมูลรั่วข้ามผู้ใช้', () => {
  test('Bob อ่านกระเป๋าของ Alice ไม่ได้ — getPocket คืน null', async () => {
    const alicesPocket = await createPocket(db, alice, { name: 'ส่วนตัวของ Alice', kind: 'holds_balance' });

    const leaked = await getPocket(db, bob, alicesPocket.id);
    expect(leaked).toBeNull();
  });

  test('listPockets ของ Bob ไม่มีกระเป๋าของ Alice ปนมา', async () => {
    await createPocket(db, alice, { name: 'ของ Alice', kind: 'holds_balance' });
    await createPocket(db, bob, { name: 'ของ Bob', kind: 'holds_balance' });

    const bobList = await listPockets(db, bob);
    expect(bobList.map((p) => p.name)).toEqual(['ของ Bob']);
  });
});
