import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, test } from 'vitest';
import { newId, nowIso } from '../domain/id';
import { createPocket, getPocket, getRollupBalanceAsOf, listPockets } from './pocket.repository';

const db = env.DB;

async function seedUser(id: string): Promise<void> {
  await db
    .prepare('INSERT INTO app_user (id, line_user_id, display_name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, `U-${id}`, 'user', nowIso())
    .run();
}

async function insertEntry(pocketId: string, userId: string, amountSatang: number, occurredOn = '2026-03-10'): Promise<void> {
  await db
    .prepare(
      `INSERT INTO entry (id, pocket_id, created_by_user_id, amount_satang, occurred_on, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'manual', ?)`
    )
    .bind(newId(), pocketId, userId, amountSatang, occurredOn, nowIso())
    .run();
}

// กระเป๋าที่ผู้ใช้ "ไม่ได้เป็นสมาชิก" แต่ผูก parent_id ไว้ใต้กระเป๋าของ alice
// (จำลอง v3 กระเป๋าร่วมที่ยัง insert ตรง ๆ — createPocket ปกติกันไม่ให้เกาะกระเป๋าคนอื่น)
async function insertForeignChild(parentId: string, ownerUserId: string, amountSatang: number): Promise<string> {
  const id = newId();
  const now = nowIso();
  await db.batch([
    db.prepare('INSERT INTO pocket (id, parent_id, name, kind, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, parentId, 'ของคนอื่น', 'holds_balance', now),
    db.prepare("INSERT INTO pocket_member (pocket_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").bind(id, ownerUserId, now)
  ]);
  await insertEntry(id, ownerUserId, amountSatang);
  return id;
}

// นับจำนวนครั้งที่เรียก db.prepare — พิสูจน์ว่า listPockets ไม่ยิง query ต่อกระเป๋า (N+1)
function countingDb(counter: { n: number }): D1Database {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (sql: string) => {
          counter.n++;
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  }) as unknown as D1Database;
}

let alice: string;
let bob: string;

beforeEach(async () => {
  alice = newId();
  bob = newId();
  await seedUser(alice);
  await seedUser(bob);
});

describe('rollup — ยอดแม่ = ยอดตัวเอง + ลูกทุกชั้น', () => {
  test('แม่ไม่มีเงินของตัวเอง ลูกมี 3,000 → rollup ของแม่ = 3,000 · balance = 0', async () => {
    const parent = await createPocket(db, alice, { name: 'Make', kind: 'holds_balance' });
    const child = await createPocket(db, alice, { name: 'Mobile', kind: 'holds_balance', parentId: parent.id });
    await insertEntry(child.id, alice, 300000);

    const p = await getPocket(db, alice, parent.id);
    expect(p?.balanceSatang).toBe(0);
    expect(p?.rollupSatang).toBe(300000);
  });

  test('แม่มีเงินเอง 500 ลูกมี 3,000 → rollup = 3,500 · balance = 500', async () => {
    const parent = await createPocket(db, alice, { name: 'Make', kind: 'holds_balance' });
    const child = await createPocket(db, alice, { name: 'Mobile', kind: 'holds_balance', parentId: parent.id });
    await insertEntry(parent.id, alice, 50000);
    await insertEntry(child.id, alice, 300000);

    const p = await getPocket(db, alice, parent.id);
    expect(p?.balanceSatang).toBe(50000);
    expect(p?.rollupSatang).toBe(350000);
  });

  test('ลูกของลูก (สามชั้น) → นับครบทุกชั้น', async () => {
    const p1 = await createPocket(db, alice, { name: 'L1', kind: 'holds_balance' });
    const p2 = await createPocket(db, alice, { name: 'L2', kind: 'holds_balance', parentId: p1.id });
    const p3 = await createPocket(db, alice, { name: 'L3', kind: 'holds_balance', parentId: p2.id });
    await insertEntry(p1.id, alice, 10000);
    await insertEntry(p2.id, alice, 20000);
    await insertEntry(p3.id, alice, 40000);

    expect((await getPocket(db, alice, p1.id))?.rollupSatang).toBe(70000);
    expect((await getPocket(db, alice, p2.id))?.rollupSatang).toBe(60000);
    expect((await getPocket(db, alice, p3.id))?.rollupSatang).toBe(40000);
  });

  test('ใบที่ไม่มีลูก → rollup = balance', async () => {
    const solo = await createPocket(db, alice, { name: 'Solo', kind: 'holds_balance' });
    await insertEntry(solo.id, alice, 12345);
    const p = await getPocket(db, alice, solo.id);
    expect(p?.rollupSatang).toBe(12345);
    expect(p?.balanceSatang).toBe(12345);
  });

  // 🔴 กันรั่วข้ามผู้ใช้แบบใหม่: ลูกที่ alice ไม่ได้เป็นสมาชิก ต้องไม่ถูกนับใน rollup ของ alice
  test('กระเป๋าลูกที่ผู้ใช้ไม่ได้เป็นสมาชิก → ไม่นับใน rollup', async () => {
    const parent = await createPocket(db, alice, { name: 'Make', kind: 'holds_balance' });
    const ownChild = await createPocket(db, alice, { name: 'Mobile', kind: 'holds_balance', parentId: parent.id });
    await insertEntry(ownChild.id, alice, 300000);
    await insertForeignChild(parent.id, bob, 999999); // ของ bob แขวนใต้ parent ของ alice

    const p = await getPocket(db, alice, parent.id);
    expect(p?.rollupSatang).toBe(300000); // เฉพาะลูกของ alice เท่านั้น ไม่รวม 999999 ของ bob
  });

  test('listPockets คืน rollup ของทุกใบใน query เดียว (ไม่ N+1)', async () => {
    const parent = await createPocket(db, alice, { name: 'Make', kind: 'holds_balance' });
    const c1 = await createPocket(db, alice, { name: 'A', kind: 'holds_balance', parentId: parent.id });
    const c2 = await createPocket(db, alice, { name: 'B', kind: 'holds_balance', parentId: parent.id });
    await createPocket(db, alice, { name: 'Solo', kind: 'holds_balance' });
    await insertEntry(c1.id, alice, 100000);
    await insertEntry(c2.id, alice, 200000);

    const counter = { n: 0 };
    const list = await listPockets(countingDb(counter), alice);
    expect(counter.n).toBe(1); // หนึ่ง query ไม่ว่ากี่กระเป๋า

    const make = list.find((p) => p.id === parent.id);
    expect(make?.rollupSatang).toBe(300000);
  });
});

describe('getRollupBalanceAsOf — rollup ณ วัน (สำหรับ reconcile)', () => {
  test('รวมลูกทุกชั้น แต่ไม่รวม entry ที่ occurred_on หลัง asOfDate', async () => {
    const parent = await createPocket(db, alice, { name: 'Make', kind: 'holds_balance' });
    const child = await createPocket(db, alice, { name: 'Mobile', kind: 'holds_balance', parentId: parent.id });
    await insertEntry(parent.id, alice, 50000, '2026-03-10');
    await insertEntry(child.id, alice, 100000, '2026-03-15');
    await insertEntry(child.id, alice, 999999, '2026-03-16'); // หลังเส้น — ต้องไม่นับ

    expect(await getRollupBalanceAsOf(db, alice, parent.id, '2026-03-15')).toBe(150000);
  });

  // 🔴 point-in-time rollup ก็ต้องกันรั่วข้ามผู้ใช้เหมือนกัน
  test('ไม่นับลูกที่ผู้ใช้ไม่ได้เป็นสมาชิก', async () => {
    const parent = await createPocket(db, alice, { name: 'Make', kind: 'holds_balance' });
    await insertForeignChild(parent.id, bob, 999999);
    expect(await getRollupBalanceAsOf(db, alice, parent.id, '2026-03-20')).toBe(0);
  });
});
