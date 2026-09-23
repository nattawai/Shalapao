import { env } from 'cloudflare:test';
import { describe, expect, test } from 'vitest';
import { upsertUserByLineId } from './app-user.repository';

const db = env.DB;

async function countByLineId(lineUserId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM app_user WHERE line_user_id = ?')
    .bind(lineUserId)
    .first<{ n: number }>();
  return row?.n ?? -1;
}

describe('upsertUserByLineId', () => {
  test('ผู้ใช้ใหม่ → สร้างแถว คืน id (ULID) พร้อม display_name', async () => {
    const { id } = await upsertUserByLineId(db, { lineUserId: 'U-new-001', displayName: 'ไว' });
    expect(id).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{26}$/);
    const row = await db
      .prepare('SELECT id, display_name AS name FROM app_user WHERE line_user_id = ?')
      .bind('U-new-001')
      .first<{ id: string; name: string }>();
    expect(row?.id).toBe(id);
    expect(row?.name).toBe('ไว');
  });

  // 🔴 login ซ้ำต้องได้ตัวตนเดิม — พึ่ง UNIQUE(line_user_id) จริง
  test('line_user_id เดิม → คืน id เดิม ไม่สร้างซ้ำ', async () => {
    const first = await upsertUserByLineId(db, { lineUserId: 'U-dup-001', displayName: 'ไว' });
    const second = await upsertUserByLineId(db, { lineUserId: 'U-dup-001', displayName: 'ไว' });
    expect(second.id).toBe(first.id);
    expect(await countByLineId('U-dup-001')).toBe(1);
  });

  test('login ซ้ำแล้วชื่อเปลี่ยน → อัปเดต display_name แต่ id เดิม', async () => {
    const first = await upsertUserByLineId(db, { lineUserId: 'U-name-001', displayName: 'ชื่อเก่า' });
    const again = await upsertUserByLineId(db, { lineUserId: 'U-name-001', displayName: 'ชื่อใหม่' });
    expect(again.id).toBe(first.id);
    const row = await db
      .prepare('SELECT display_name AS name FROM app_user WHERE line_user_id = ?')
      .bind('U-name-001')
      .first<{ name: string }>();
    expect(row?.name).toBe('ชื่อใหม่');
  });

  // 🔴 LINE บางครั้งคืน name ว่าง (ไม่มี scope profile ชั่วคราว) — ห้ามทับชื่อที่เก็บไว้แล้ว
  test('login ด้วยชื่อว่าง → ไม่ทับชื่อเดิม', async () => {
    const first = await upsertUserByLineId(db, { lineUserId: 'U-keep-001', displayName: 'ไว' });
    const again = await upsertUserByLineId(db, { lineUserId: 'U-keep-001', displayName: '' });
    expect(again.id).toBe(first.id);
    const row = await db
      .prepare('SELECT display_name AS name FROM app_user WHERE line_user_id = ?')
      .bind('U-keep-001')
      .first<{ name: string }>();
    expect(row?.name).toBe('ไว');
  });
});
