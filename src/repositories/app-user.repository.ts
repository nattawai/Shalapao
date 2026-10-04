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
// 🔴 D1 บังคับ FK (ยืนยันแล้วว่า Miniflare บังคับ) → ลำดับลบตาม FK (child→parent):
//   pocket_reconcile → entry → pocket_member → pocket → category → app_user
// 🔴 ทุกคำสั่งต้อง scoped ด้วย userId หรือ id กระเป๋าที่ยืนยันแล้วว่าเป็นของผู้ใช้ (§2.3 — ห้ามพึ่งว่า
//   "ทุกกระเป๋ามีสมาชิก" ที่โค้ดอื่น) · จึง SELECT solo ids ก่อน (SELECT ไม่ติดลิมิต param) แล้วหั่น
//   ก้อนละ 50 ใส่ IN (...) — ลิมิต D1 คือ 100 "parameter" ต่อ query ไม่ใช่ขนาดผลลัพธ์
// "solo pocket" = ผู้ใช้เป็นสมาชิก active และไม่มี active คนอื่น → ลบทั้งใบ · กระเป๋าร่วม → แค่ตั้ง left_at
export async function deleteAccount(db: D1Database, userId: string): Promise<void> {
  const now = nowIso();
  const { results } = await db
    .prepare(
      `SELECT pm.pocket_id AS pocket_id,
              EXISTS(SELECT 1 FROM pocket_member o WHERE o.pocket_id = pm.pocket_id AND o.user_id <> ? AND o.left_at IS NULL) AS shared
       FROM pocket_member pm
       WHERE pm.user_id = ? AND pm.left_at IS NULL`
    )
    .bind(userId, userId)
    .all<{ pocket_id: string; shared: number }>();
  const soloIds = results.filter((r) => r.shared === 0).map((r) => r.pocket_id);
  const sharedIds = results.filter((r) => r.shared !== 0).map((r) => r.pocket_id);

  const chunks = (ids: string[]): string[][] => {
    const out: string[][] = [];
    for (let i = 0; i < ids.length; i += 50) out.push(ids.slice(i, i + 50));
    return out;
  };
  const marks = (ids: string[]) => ids.map(() => '?').join(', ');

  const ops: D1PreparedStatement[] = [];
  for (const c of chunks(soloIds)) ops.push(db.prepare(`DELETE FROM pocket_reconcile WHERE pocket_id IN (${marks(c)})`).bind(...c));
  for (const c of chunks(soloIds)) ops.push(db.prepare(`DELETE FROM entry WHERE pocket_id IN (${marks(c)})`).bind(...c));
  for (const c of chunks(soloIds)) ops.push(db.prepare(`DELETE FROM pocket_member WHERE pocket_id IN (${marks(c)})`).bind(...c));
  // 🔴 เคลียร์ parent_id ของ solo ก่อนลบ pocket — กระเป๋าซ้อนชั้น (แม่-ลูก) มี FK pocket.parent_id → pocket
  // ลบแม่ก่อนลูกในคำสั่งเดียวจะชน FK · ตัดสาย parent ก่อนจึงลบได้ทุกลำดับ (ใบกำลังจะหายอยู่แล้ว)
  for (const c of chunks(soloIds)) ops.push(db.prepare(`UPDATE pocket SET parent_id = NULL WHERE id IN (${marks(c)})`).bind(...c));
  for (const c of chunks(soloIds)) ops.push(db.prepare(`DELETE FROM pocket WHERE id IN (${marks(c)})`).bind(...c));
  // กระเป๋าร่วม → ตั้ง left_at ของผู้ใช้นี้ (ไม่แตะกระเป๋า/entry — ยอดคนอื่นต้องไม่เพี้ยน)
  for (const c of chunks(sharedIds)) ops.push(db.prepare(`UPDATE pocket_member SET left_at = ? WHERE user_id = ? AND left_at IS NULL AND pocket_id IN (${marks(c)})`).bind(now, userId, ...c));

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

// สำเนาข้อมูลของผู้ใช้ทั้งหมด (PDPA — สิทธิเข้าถึงข้อมูล) · ดิบตามที่เก็บจริง ไม่คำนวณ/ไม่แปลงหน่วย
// ยอดคงเป็นสตางค์จำนวนเต็ม (amountUnit บอกหน่วย) · ไม่ใส่ยอด balance (ค่า derived — ไฟล์เดียวมีเลข
// สองชุดที่อาจไม่ตรงกันแล้วไม่รู้เชื่ออันไหน · หลักเดียวกับที่ไม่เก็บยอดในคอลัมน์)
//
// 🔴 entries กรองด้วย created_by_user_id = ผู้ใช้ ไม่ใช่ membership — "ขอสำเนาข้อมูลตัวเอง" ไม่ใช่
// "ขอทุกอย่างที่มองเห็น" · กระเป๋าร่วม (v3) รายการของคนอื่นในกระเป๋าที่เราเห็นต้องไม่หลุดออกไป
// รวมแถวที่ลบแล้ว (deleted_at ไม่ null) ด้วย — เรายังเก็บมันอยู่ จึงต้องบอกว่าเก็บอยู่
// memberships เฉพาะแถวของผู้ใช้ · pockets ส่งเฉพาะคอลัมน์ของ pocket (ไม่มี field บอกว่าใครอยู่ในนั้น)
//
// 🔴 ข้อจำกัดที่รู้ตัว: ไม่มี pagination — ผู้ใช้ที่มีรายการหลักหมื่นจะได้ก้อนเดียวใหญ่มาก · ถ้าวันหนึ่ง
// ชน response size limit ของ Workers/D1 ต้องเปลี่ยนเป็น stream หรือแบ่งหน้า · ยังไม่แก้ตอนนี้
export type AccountExport = {
  exportedAt: string;
  amountUnit: 'satang';
  user: Record<string, unknown> | null;
  categories: Record<string, unknown>[];
  pockets: Record<string, unknown>[];
  memberships: Record<string, unknown>[];
  entries: Record<string, unknown>[];
  reconciles: Record<string, unknown>[];
};

export async function exportAccount(db: D1Database, userId: string): Promise<AccountExport> {
  const batch = await db.batch([
    db.prepare('SELECT id, line_user_id, google_sub, display_name, created_at FROM app_user WHERE id = ?').bind(userId),
    db.prepare('SELECT id, name, icon, sort_order, archived_at, created_at FROM category WHERE user_id = ? ORDER BY sort_order, id').bind(userId),
    db
      .prepare(
        `SELECT p.id, p.parent_id, p.name, p.kind, p.category_id, p.sort_order, p.last_reconciled_at, p.archived_at, p.created_at
         FROM pocket p JOIN pocket_member m ON m.pocket_id = p.id
         WHERE m.user_id = ? AND m.left_at IS NULL
         ORDER BY p.sort_order, p.id`
      )
      .bind(userId),
    db.prepare('SELECT pocket_id, user_id, role, joined_at, left_at FROM pocket_member WHERE user_id = ? ORDER BY pocket_id').bind(userId),
    db
      .prepare(
        `SELECT id, pocket_id, created_by_user_id, amount_satang, occurred_on, category_id, note, source,
                transfer_id, reverses_id, deleted_at, updated_at, created_at
         FROM entry WHERE created_by_user_id = ? ORDER BY occurred_on, id`
      )
      .bind(userId),
    db
      .prepare(
        `SELECT id, pocket_id, reconciled_by, as_of_date, expected_satang, actual_satang,
                adjustment_id, previous_line, cancelled_at, created_at
         FROM pocket_reconcile WHERE reconciled_by = ? ORDER BY created_at, id`
      )
      .bind(userId)
  ]);
  const rows = (i: number): Record<string, unknown>[] => (batch[i]?.results ?? []) as Record<string, unknown>[];

  const userRow = rows(0)[0];
  return {
    exportedAt: nowIso(),
    amountUnit: 'satang',
    user: userRow ? mapUser(userRow) : null,
    categories: rows(1).map(mapCategory),
    pockets: rows(2).map(mapPocket),
    memberships: rows(3).map(mapMembership),
    entries: rows(4).map(mapEntry),
    reconciles: rows(5).map(mapReconcile)
  };
}

function mapUser(r: Record<string, unknown>) {
  return { id: r.id, lineUserId: r.line_user_id, googleSub: r.google_sub, displayName: r.display_name, createdAt: r.created_at };
}
function mapCategory(r: Record<string, unknown>) {
  return { id: r.id, name: r.name, icon: r.icon, sortOrder: r.sort_order, archivedAt: r.archived_at, createdAt: r.created_at };
}
function mapPocket(r: Record<string, unknown>) {
  return {
    id: r.id, parentId: r.parent_id, name: r.name, kind: r.kind, categoryId: r.category_id,
    sortOrder: r.sort_order, lastReconciledAt: r.last_reconciled_at, archivedAt: r.archived_at, createdAt: r.created_at
  };
}
function mapMembership(r: Record<string, unknown>) {
  return { pocketId: r.pocket_id, userId: r.user_id, role: r.role, joinedAt: r.joined_at, leftAt: r.left_at };
}
function mapEntry(r: Record<string, unknown>) {
  return {
    id: r.id, pocketId: r.pocket_id, createdByUserId: r.created_by_user_id, amountSatang: r.amount_satang,
    occurredOn: r.occurred_on, categoryId: r.category_id, note: r.note, source: r.source,
    transferId: r.transfer_id, reversesId: r.reverses_id, deletedAt: r.deleted_at, updatedAt: r.updated_at, createdAt: r.created_at
  };
}
function mapReconcile(r: Record<string, unknown>) {
  return {
    id: r.id, pocketId: r.pocket_id, reconciledBy: r.reconciled_by, asOfDate: r.as_of_date,
    expectedSatang: r.expected_satang, actualSatang: r.actual_satang, adjustmentId: r.adjustment_id,
    previousLine: r.previous_line, cancelledAt: r.cancelled_at, createdAt: r.created_at
  };
}
