import { newId, nowIso } from '../domain/id';

export type UpsertUserInput = {
  lineUserId: string;
  displayName: string;
};

// upsert ด้วย ON CONFLICT บน line_user_id (UNIQUE) — login ซ้ำไม่สร้างตัวตนใหม่
// อัปเดต display_name เฉพาะตอนเปลี่ยนจริง (WHERE) ไม่งั้นทุก login = D1 write เปล่า ๆ
// อ่าน id กลับด้วย SELECT เสมอ เพราะกรณี no-op (ชื่อไม่เปลี่ยน) RETURNING ไม่คืนแถว
export async function upsertUserByLineId(
  db: D1Database,
  input: UpsertUserInput
): Promise<{ id: string }> {
  await db
    .prepare(
      `INSERT INTO app_user (id, line_user_id, display_name, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(line_user_id) DO UPDATE SET display_name = excluded.display_name
         WHERE display_name <> excluded.display_name`
    )
    .bind(newId(), input.lineUserId, input.displayName, nowIso())
    .run();

  const row = await db
    .prepare('SELECT id FROM app_user WHERE line_user_id = ?')
    .bind(input.lineUserId)
    .first<{ id: string }>();
  if (!row) throw new Error('upsert app_user แล้วอ่านกลับไม่เจอ — ไม่ควรเกิด');
  return { id: row.id };
}
