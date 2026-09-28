import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, test } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../../src/domain/errors';
import { newId, nowIso } from '../../src/domain/id';
import { createEntry } from '../../src/repositories/entry.repository';
import { createPocket, getRollupBalanceAsOf } from '../../src/repositories/pocket.repository';
import { getLastReconcile } from '../../src/repositories/pocket-reconcile.repository';
import { reconcile, unreconcile } from '../../src/services/reconcile.service';

const db = env.DB;

async function seedUser(id: string): Promise<void> {
  await db.prepare('INSERT INTO app_user (id, line_user_id, display_name, created_at) VALUES (?, ?, ?, ?)').bind(id, `U-${id}`, 'user', nowIso()).run();
}

async function lastLine(pocketId: string): Promise<string | null> {
  const row = await db.prepare('SELECT last_reconciled_at AS d FROM pocket WHERE id = ?').bind(pocketId).first<{ d: string | null }>();
  return row?.d ?? null;
}

let alice: string;
let bob: string;

beforeEach(async () => {
  alice = newId();
  bob = newId();
  await seedUser(alice);
  await seedUser(bob);
});

describe('unreconcile — happy path', () => {
  // 🔴 ข้อพิสูจน์ที่แท้จริง: ยอดกลับไปเท่ากับก่อนตรวจยอด
  test('ยกเลิกแล้วยอดกระเป๋ากลับเท่ากับก่อนตรวจยอด · adjustment ถูกลบ · เส้นเป็น NULL', async () => {
    const p = await createPocket(db, alice, { name: 'p', kind: 'holds_balance' });
    await createEntry(db, alice, { pocketId: p.id, amountSatang: 100000, occurredOn: '2026-09-10' });

    await reconcile(db, alice, { pocketId: p.id, asOfDate: '2026-09-20', actualBalanceSatang: 105000 });
    expect(await getRollupBalanceAsOf(db, alice, p.id, '2026-09-20')).toBe(105000); // มี adjustment +5000

    const last = await getLastReconcile(db, alice, p.id);
    const res = await unreconcile(db, alice, p.id);

    expect(res.restoredLine).toBeNull();
    expect(res.adjustmentReversed).toBe(true);
    expect(await lastLine(p.id)).toBeNull();
    expect(await getRollupBalanceAsOf(db, alice, p.id, '2026-09-20')).toBe(100000); // กลับเท่าก่อนตรวจ
    // adjustment ถูก soft delete
    const adj = await db.prepare('SELECT deleted_at FROM entry WHERE id = ?').bind(last?.adjustmentId ?? '').first<{ deleted_at: string | null }>();
    expect(adj?.deleted_at).not.toBeNull();
  });

  test('เส้นกลับไปเป็นค่าก่อนหน้า (ตรวจสองครั้ง)', async () => {
    const p = await createPocket(db, alice, { name: 'p', kind: 'holds_balance' });
    await reconcile(db, alice, { pocketId: p.id, asOfDate: '2026-09-15', actualBalanceSatang: 0 });
    await reconcile(db, alice, { pocketId: p.id, asOfDate: '2026-09-20', actualBalanceSatang: 0 });
    await unreconcile(db, alice, p.id);
    expect(await lastLine(p.id)).toBe('2026-09-15');
  });

  test('ตรวจยอดส่วนต่าง = 0 (ไม่มี adjustment) ยกเลิกได้ ไม่ throw', async () => {
    const p = await createPocket(db, alice, { name: 'p', kind: 'holds_balance' });
    await createEntry(db, alice, { pocketId: p.id, amountSatang: 50000, occurredOn: '2026-09-10' });
    await reconcile(db, alice, { pocketId: p.id, asOfDate: '2026-09-20', actualBalanceSatang: 50000 }); // diff 0
    const res = await unreconcile(db, alice, p.id);
    expect(res.adjustmentReversed).toBe(false);
    expect(await lastLine(p.id)).toBeNull();
  });

  test('ยกเลิกซ้ำ → ถอยไปอีกขั้น ไม่ใช่ error · ยกเลิกจนหมดแล้วอีก → 404', async () => {
    const p = await createPocket(db, alice, { name: 'p', kind: 'holds_balance' });
    await reconcile(db, alice, { pocketId: p.id, asOfDate: '2026-09-15', actualBalanceSatang: 0 });
    await reconcile(db, alice, { pocketId: p.id, asOfDate: '2026-09-20', actualBalanceSatang: 0 });

    await unreconcile(db, alice, p.id);
    expect(await lastLine(p.id)).toBe('2026-09-15');
    await unreconcile(db, alice, p.id);
    expect(await lastLine(p.id)).toBeNull();
    await expect(unreconcile(db, alice, p.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('unreconcile — validation', () => {
  test('ไม่เคยตรวจยอด → reconcile_not_found (404)', async () => {
    const p = await createPocket(db, alice, { name: 'p', kind: 'holds_balance' });
    await expect(unreconcile(db, alice, p.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  // 🔴 กันรั่วข้ามผู้ใช้ — ห้ามลบ ห้าม skip
  test('ผู้ใช้ B ยกเลิกการตรวจยอดของกระเป๋าผู้ใช้ A ไม่ได้ → 403', async () => {
    const p = await createPocket(db, alice, { name: 'p', kind: 'holds_balance' });
    await reconcile(db, alice, { pocketId: p.id, asOfDate: '2026-09-20', actualBalanceSatang: 0 });
    await expect(unreconcile(db, bob, p.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await lastLine(p.id)).toBe('2026-09-20'); // ไม่ถูกแตะ
  });
});

describe('unreconcile — ancestor guard', () => {
  test('แม่ปิดคลุมวันของลูก → 409 · ไม่มีอะไรเปลี่ยน', async () => {
    const parent = await createPocket(db, alice, { name: 'แม่', kind: 'holds_balance' });
    const child = await createPocket(db, alice, { name: 'ลูก', kind: 'holds_balance', parentId: parent.id });
    await reconcile(db, alice, { pocketId: child.id, asOfDate: '2026-09-15', actualBalanceSatang: 0 });
    await reconcile(db, alice, { pocketId: parent.id, asOfDate: '2026-09-20', actualBalanceSatang: 0 });

    await expect(unreconcile(db, alice, child.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await lastLine(child.id)).toBe('2026-09-15'); // ไม่ถูกถอย
  });

  test('แม่ปิดก่อนวันของลูก → ยกเลิกลูกได้', async () => {
    const parent = await createPocket(db, alice, { name: 'แม่', kind: 'holds_balance' });
    const child = await createPocket(db, alice, { name: 'ลูก', kind: 'holds_balance', parentId: parent.id });
    await reconcile(db, alice, { pocketId: parent.id, asOfDate: '2026-09-10', actualBalanceSatang: 0 });
    await reconcile(db, alice, { pocketId: child.id, asOfDate: '2026-09-15', actualBalanceSatang: 0 });
    await unreconcile(db, alice, child.id);
    expect(await lastLine(child.id)).toBeNull();
  });

  test('แม่ 3 ชั้น ชั้นบนสุดปิดคลุม → 409 และข้อความอ้างถึงชั้นบนสุด', async () => {
    const top = await createPocket(db, alice, { name: 'ชั้นบนสุด', kind: 'holds_balance' });
    const mid = await createPocket(db, alice, { name: 'กลาง', kind: 'holds_balance', parentId: top.id });
    const child = await createPocket(db, alice, { name: 'ลูก', kind: 'holds_balance', parentId: mid.id });
    await reconcile(db, alice, { pocketId: child.id, asOfDate: '2026-09-15', actualBalanceSatang: 0 });
    await reconcile(db, alice, { pocketId: top.id, asOfDate: '2026-09-20', actualBalanceSatang: 0 });

    await expect(unreconcile(db, alice, child.id)).rejects.toThrow('ชั้นบนสุด');
  });
});
