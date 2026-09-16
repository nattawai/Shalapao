import { env } from 'cloudflare:test';
import { describe, expect, test } from 'vitest';
import { newId, nowIso } from '../../src/domain/id';

const db = env.DB;

// migration 0007 เพิ่ม trigger บังคับ pocket.last_reconciled_at ให้เป็น YYYY-MM-DD
//
// ต้องพิสูจน์ว่า trigger "ยิงจริงบน D1" ไม่ใช่แค่ migration รันผ่าน — ถ้า D1 กลืน
// trigger เงียบ ๆ migration จะสำเร็จ test อื่นเขียวหมด แต่ ISO timestamp จะหลุด
// เข้า last_reconciled_at ได้ แล้ว guard ที่เทียบ string ('2026-03-15' <=
// '2026-03-15T10:00:00Z' เป็น true) จะพลาดเงียบ ๆ — แพทเทิร์นเดียวกับ Intl/workerd

async function insertPocketRaw(lastReconciledAt?: string): Promise<void> {
  const id = newId();
  const now = nowIso();
  if (lastReconciledAt === undefined) {
    await db
      .prepare('INSERT INTO pocket (id, name, kind, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, 'p', 'holds_balance', now)
      .run();
  } else {
    await db
      .prepare('INSERT INTO pocket (id, name, kind, last_reconciled_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, 'p', 'holds_balance', lastReconciledAt, now)
      .run();
  }
}

async function insertPocketReturningId(): Promise<string> {
  const id = newId();
  await db
    .prepare('INSERT INTO pocket (id, name, kind, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, 'p', 'holds_balance', nowIso())
    .run();
  return id;
}

async function countPockets(): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM pocket').first<{ n: number }>();
  return row?.n ?? -1;
}

describe('trigger รูปแบบ last_reconciled_at บน D1', () => {
  // 🔴 หัวใจ: ถ้าข้อนี้ไม่ error แปลว่า D1 ไม่บังคับ trigger — ช่องโหว่เปิดอยู่
  test('UPDATE ด้วย ISO timestamp → error', async () => {
    const id = await insertPocketReturningId();
    await expect(
      db.prepare('UPDATE pocket SET last_reconciled_at = ? WHERE id = ?').bind('2026-03-15T10:00:00Z', id).run()
    ).rejects.toThrow();
  });

  test('UPDATE ด้วย YYYY-MM-DD → ผ่าน', async () => {
    const id = await insertPocketReturningId();
    await db.prepare('UPDATE pocket SET last_reconciled_at = ? WHERE id = ?').bind('2026-03-15', id).run();
    const row = await db.prepare('SELECT last_reconciled_at AS d FROM pocket WHERE id = ?').bind(id).first<{ d: string }>();
    expect(row?.d).toBe('2026-03-15');
  });

  test('INSERT พร้อม last_reconciled_at ผิดรูปแบบ → error ไม่มีแถวเกิด', async () => {
    const before = await countPockets();
    await expect(insertPocketRaw('15/03/2026')).rejects.toThrow();
    expect(await countPockets()).toBe(before);
  });

  test('UPDATE เป็น NULL → ผ่าน (ล้างเส้นได้)', async () => {
    const id = await insertPocketReturningId();
    await db.prepare('UPDATE pocket SET last_reconciled_at = ? WHERE id = ?').bind('2026-03-15', id).run();
    await db.prepare('UPDATE pocket SET last_reconciled_at = NULL WHERE id = ?').bind(id).run();
    const row = await db
      .prepare('SELECT last_reconciled_at AS d FROM pocket WHERE id = ?')
      .bind(id)
      .first<{ d: string | null }>();
    expect(row?.d).toBeNull();
  });
});
