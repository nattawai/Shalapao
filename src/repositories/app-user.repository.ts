import { newId, nowIso } from '../domain/id';

export type UpsertUserInput = {
  lineUserId: string;
  displayName: string;
};

// upsert ด้วย ON CONFLICT บน line_user_id (UNIQUE) — login ซ้ำไม่สร้างตัวตนใหม่
// อัปเดต display_name เฉพาะตอนเปลี่ยนจริง (WHERE) ไม่งั้นทุก login = D1 write เปล่า ๆ
// และห้ามทับด้วยชื่อว่าง — LINE บางครั้งคืน name ว่างชั่วคราว ต้องเก็บชื่อเดิมไว้
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
         WHERE display_name <> excluded.display_name AND excluded.display_name <> ''`
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

// ลบบัญชีถาวร (PDPA — เจ้าของข้อมูลเอาข้อมูลออกเองได้) · hard delete ไม่ใช่ soft · batch เดียว
// (ลบครึ่งทางแล้วพัง = สถานะที่ซ่อมไม่ได้) · เรียกซ้ำหลังลบได้ 204 เพราะ auth upsert สร้างบัญชี
// ว่างใหม่ก่อนถึงที่นี่ แล้วลบของว่าง — ไม่ใช่บั๊ก
//
// "solo pocket" = กระเป๋าที่ผู้ใช้นี้เป็นสมาชิก active และไม่มี active คนอื่น → ลบทั้งใบ
// กระเป๋าที่ยังมี active คนอื่น → แค่ตั้ง left_at ของผู้ใช้นี้ ห้ามลบกระเป๋า/entry ในนั้น
// (ลบ entry ของคนที่ออกไป = ยอดของสมาชิกที่เหลือเพี้ยนทันทีโดยเขาไม่รู้ตัว)
//
// 🔴 หา solo ด้วย subquery ใน SQL ไม่ใช่ bind id ทีละใบ — D1 จำกัด bound parameter 100 ตัว/query
// ผู้ใช้ที่มีกระเป๋าเกิน 100 ใบจะลบบัญชีไม่ได้ (และนี่คือ endpoint สิทธิ PDPA ต้องไม่พัง) · subquery
// ใช้ param คงที่ (แค่ userId) ไม่ว่ากี่ใบ
//
// 🔴 D1 บังคับ FK (ยืนยันแล้วว่า Miniflare บังคับ) → ต้องลบ pocket_member "ก่อน" pocket (member → pocket)
// แต่ subquery หา solo อ่านจาก pocket_member — พอลบ member แล้ว subquery จะว่าง ใช้กับ DELETE pocket
// ไม่ได้ · จึงลบ pocket ด้วย predicate "ไม่มีสมาชิกเหลือแล้ว" (กระเป๋าจะไร้สมาชิกได้เฉพาะ solo ที่เพิ่ง
// ลบ member ไป — กระเป๋าร่วมยังมีสมาชิกคนอื่น · ทุกกระเป๋าถูกสร้างพร้อมสมาชิกเสมอ จึงไม่มีใบอื่นโดนพลอย)
// ลำดับ: reconcile → entry → (left_at ร่วม) → pocket_member(solo) → pocket(ไร้สมาชิก) → category → app_user
export async function deleteAccount(db: D1Database, userId: string): Promise<void> {
  const now = nowIso();
  const solo = `SELECT pm.pocket_id FROM pocket_member pm
    WHERE pm.user_id = ? AND pm.left_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM pocket_member o WHERE o.pocket_id = pm.pocket_id AND o.user_id <> ? AND o.left_at IS NULL)`;

  const ops: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM pocket_reconcile WHERE pocket_id IN (${solo})`).bind(userId, userId),
    db.prepare(`DELETE FROM entry WHERE pocket_id IN (${solo})`).bind(userId, userId),
    // กระเป๋าร่วม (NOT solo) ของผู้ใช้นี้ → ตั้ง left_at · อ่าน pocket_member ก่อน member solo ถูกลบ
    db
      .prepare(`UPDATE pocket_member SET left_at = ? WHERE user_id = ? AND left_at IS NULL AND pocket_id NOT IN (${solo})`)
      .bind(now, userId, userId, userId),
    db.prepare(`DELETE FROM pocket_member WHERE pocket_id IN (${solo})`).bind(userId, userId),
    db.prepare('DELETE FROM pocket WHERE NOT EXISTS (SELECT 1 FROM pocket_member m WHERE m.pocket_id = pocket.id)')
  ];

  // ลบหมวดของผู้ใช้เฉพาะที่ไม่มี entry (ที่เหลืออยู่) อ้างถึง · ที่ถูก entry ในกระเป๋าร่วมอ้างจะไม่ถูกลบ
  // 🔴 ผลคือ entry นั้นกลายเป็น "ไม่ระบุหมวด" ตอนอ่าน (LEFT JOIN category ไม่เจอ) — ยอมรับได้
  // เกิดเฉพาะ v3 (กระเป๋าร่วม) · v0 ไม่มี entry เหลือจึงลบหมวดครบเสมอ
  ops.push(db.prepare('DELETE FROM category WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM entry WHERE entry.category_id = category.id)').bind(userId));

  // ลบ app_user เฉพาะเมื่อไม่มีแถวใดอ้างถึงแล้ว (ทางเลือก B)
  // 🔴 เลือก B เพราะ test พิสูจน์ไม่ได้ว่า D1 จริงบังคับ FK หรือไม่ (เทสรันบน Miniflare ในเครื่อง
  // ไม่ใช่ D1 บน Cloudflare · pragma ต่างกันได้ · เป็นชนิดที่เทสเขียวแต่ production พัง) · เงื่อนไข
  // NOT EXISTS ทำให้ batch ไม่ fail ทั้ง FK เปิด/ปิด
  // 🔴 หนี้ PDPA: เคสกระเป๋าร่วม app_user ของผู้ใช้จะถูกเก็บไว้ = เก็บ display_name + line_user_id
  // ของคนที่ขอให้ลบ เป็นปัญหา PDPA จริง · v0 ยังไม่เกิด (ไม่มีกระเป๋าร่วม) แต่ v3 ต้องแก้ด้วย
  // tombstone user (แถวไม่มี PII ให้ entry เก่าอ้าง) — ห้ามปล่อยผ่านด้วยเหตุผลว่า "v0 ไม่เกิด"
  ops.push(
    db
      .prepare(
        `DELETE FROM app_user WHERE id = ?
           AND NOT EXISTS (SELECT 1 FROM entry WHERE created_by_user_id = ?)
           AND NOT EXISTS (SELECT 1 FROM pocket_member WHERE user_id = ?)
           AND NOT EXISTS (SELECT 1 FROM category WHERE user_id = ?)
           AND NOT EXISTS (SELECT 1 FROM pocket_reconcile WHERE reconciled_by = ?)`
      )
      .bind(userId, userId, userId, userId, userId)
  );

  await db.batch(ops);
}
