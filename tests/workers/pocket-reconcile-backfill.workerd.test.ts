import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, test } from 'vitest';
import { newId, nowIso } from '../../src/domain/id';

const db = env.DB;

// migration 0009 สร้าง ULID ใน static SQL ไม่ได้ จึงมิเรอร์ backfill INSERT มาพิสูจน์ตรรกะ
// บน workerd SQLite จริง (ของจริงบน remote รันตอน pnpm db:remote)
const BACKFILL = `
  INSERT INTO pocket_reconcile (id, pocket_id, reconciled_by, as_of_date,
                                expected_satang, actual_satang, adjustment_id,
                                previous_line, created_at)
  SELECT
    lower(hex(randomblob(16))),
    p.id,
    (SELECT user_id FROM pocket_member WHERE pocket_id = p.id AND left_at IS NULL LIMIT 1),
    p.last_reconciled_at,
    0, 0, NULL, NULL,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM pocket p
  WHERE p.last_reconciled_at IS NOT NULL
`;

let alice: string;

async function seedUser(id: string): Promise<void> {
  await db.prepare('INSERT INTO app_user (id, line_user_id, display_name, created_at) VALUES (?, ?, ?, ?)').bind(id, `U-${id}`, 'user', nowIso()).run();
}

async function seedPocket(userId: string, lastReconciledAt: string | null): Promise<string> {
  const id = newId();
  const now = nowIso();
  if (lastReconciledAt === null) {
    await db.prepare('INSERT INTO pocket (id, name, kind, created_at) VALUES (?, ?, ?, ?)').bind(id, 'p', 'holds_balance', now).run();
  } else {
    await db.prepare('INSERT INTO pocket (id, name, kind, last_reconciled_at, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, 'p', 'holds_balance', lastReconciledAt, now).run();
  }
  await db.prepare("INSERT INTO pocket_member (pocket_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").bind(id, userId, now).run();
  return id;
}

beforeEach(async () => {
  alice = newId();
  await seedUser(alice);
});

describe('migration 0009 — pocket_reconcile + backfill', () => {
  test('backfill สร้างแถวตั้งต้น: as_of_date = เส้นเดิม · previous_line = NULL · expected/actual = 0', async () => {
    const pocketId = await seedPocket(alice, '2026-09-23');
    await db.prepare(BACKFILL).run();

    const row = await db
      .prepare('SELECT * FROM pocket_reconcile WHERE pocket_id = ?')
      .bind(pocketId)
      .first<{ id: string; reconciled_by: string; as_of_date: string; expected_satang: number; actual_satang: number; adjustment_id: string | null; previous_line: string | null; cancelled_at: string | null }>();

    expect(row?.as_of_date).toBe('2026-09-23');
    expect(row?.previous_line).toBeNull(); // แถวตั้งต้น ถอยแล้วเส้นเป็น NULL
    expect(row?.reconciled_by).toBe(alice);
    expect(row?.expected_satang).toBe(0);
    expect(row?.actual_satang).toBe(0);
    expect(row?.adjustment_id).toBeNull();
    expect(row?.cancelled_at).toBeNull();
    expect(row?.id).toBeTruthy();
  });

  test('กระเป๋าที่ยังไม่เคยตรวจยอด (last_reconciled_at = NULL) ไม่ถูก backfill', async () => {
    const pocketId = await seedPocket(alice, null);
    await db.prepare(BACKFILL).run();
    const row = await db.prepare('SELECT id FROM pocket_reconcile WHERE pocket_id = ?').bind(pocketId).first();
    expect(row).toBeNull();
  });

  test('CHECK as_of_date รูปแบบผิด → ปฏิเสธ', async () => {
    const pocketId = await seedPocket(alice, null);
    await expect(
      db
        .prepare('INSERT INTO pocket_reconcile (id, pocket_id, reconciled_by, as_of_date, expected_satang, actual_satang, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)')
        .bind(newId(), pocketId, alice, '23/09/2026', nowIso())
        .run()
    ).rejects.toThrow();
  });
});
