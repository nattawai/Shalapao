import { ConflictError, ForbiddenError } from '../domain/errors';
import { newId, nowIso } from '../domain/id';
import { satangToBaht } from '../domain/money';

export type PocketKind = 'holds_balance' | 'flow_through';
export type MemberRole = 'owner' | 'editor' | 'viewer';

export type PocketWithBalance = {
  id: string;
  parentId: string | null;
  name: string;
  kind: PocketKind;
  categoryId: string | null;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  role: MemberRole;
  balanceSatang: number;
  rollupSatang: number;
  entryCount: number;
  lastEntryOn: string | null;
};

export type CreatePocketInput = {
  name: string;
  kind: PocketKind;
  parentId?: string | null;
  categoryId?: string | null;
  sortOrder?: number;
};

export type ListPocketsOptions = {
  includeArchived?: boolean;
};

type PocketRow = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: PocketKind;
  category_id: string | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  role: MemberRole;
  balance_satang: number;
  rollup_satang: number;
  entry_count: number;
  last_entry_on: string | null;
};

// จุดเดียวที่ยัด user filter: เริ่มจาก pocket_member ที่ยัง active เสมอ
// ไม่มีทางเขียน query ที่อ้าง pocket_id ตรง ๆ โดยลืมสิทธิ์ เพราะทุกเมธอดต่อจากนี้
// ยอดคงเหลืออ่านจาก view pocket_balance ไม่คำนวณเองในโค้ด (ข้อตกลงข้อ 4)
//
// rollup_satang = ยอดตัวเอง + ลูกทุกชั้น · ไล่ต้นไม้จาก view pocket_subtree แล้ว
// 🔴 กรองผ่าน pocket_member ของ "ผู้ใช้คนนี้" ก่อน SUM — ลูกที่เขาไม่ได้เป็นสมาชิกจะไม่ถูกนับ
// (กันยอดกระเป๋าที่ไม่ได้แชร์รั่วเข้ายอดรวมตอนมีกระเป๋าร่วม v3) · เป็น subquery ตัวเดียว
// ในคำสั่งเดียว จึงไม่ N+1 แม้ listPockets จะมีหลายใบ · self อยู่ใน subtree เสมอ ค่าจึงไม่ null
const SELECT_MEMBER_POCKET = `
  SELECT
    p.id, p.parent_id, p.name, p.kind, p.category_id, p.sort_order,
    p.archived_at, p.created_at,
    m.role,
    b.balance_satang, b.entry_count, b.last_entry_on,
    COALESCE((
      SELECT SUM(sb.balance_satang)
      FROM pocket_subtree st
      JOIN pocket_member sm ON sm.pocket_id = st.node_id AND sm.user_id = ? AND sm.left_at IS NULL
      JOIN pocket_balance sb ON sb.pocket_id = st.node_id
      WHERE st.root_id = p.id
    ), b.balance_satang) AS rollup_satang
  FROM pocket_member m
  JOIN pocket p         ON p.id = m.pocket_id
  JOIN pocket_balance b ON b.pocket_id = p.id
  WHERE m.user_id = ? AND m.left_at IS NULL
`;

function mapRow(row: PocketRow): PocketWithBalance {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind,
    categoryId: row.category_id,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    role: row.role,
    balanceSatang: row.balance_satang,
    rollupSatang: row.rollup_satang,
    entryCount: row.entry_count,
    lastEntryOn: row.last_entry_on
  };
}

export async function listPockets(
  db: D1Database,
  userId: string,
  options: ListPocketsOptions = {}
): Promise<PocketWithBalance[]> {
  // กระเป๋าที่ archive แล้วซ่อนโดยค่าเริ่มต้น · ขอเห็นได้ผ่าน includeArchived
  const archivedFilter = options.includeArchived ? '' : ' AND p.archived_at IS NULL';
  const { results } = await db
    .prepare(`${SELECT_MEMBER_POCKET}${archivedFilter} ORDER BY p.sort_order, p.id`)
    .bind(userId, userId) // ตัวแรก = subquery rollup · ตัวสอง = WHERE ของ SELECT หลัก
    .all<PocketRow>();
  return results.map(mapRow);
}

export async function getPocket(
  db: D1Database,
  userId: string,
  pocketId: string
): Promise<PocketWithBalance | null> {
  const row = await db
    .prepare(`${SELECT_MEMBER_POCKET} AND m.pocket_id = ?`)
    .bind(userId, userId, pocketId) // subquery rollup · WHERE หลัก · pocket_id
    .first<PocketRow>();
  return row ? mapRow(row) : null;
}

export type Summary = {
  totalSatang: number;
  pocketCount: number;
};

// ยอดรวมของผู้ใช้ + จำนวนกระเป๋า สำหรับหน้าแรก
// 🔴 SUM ยอด "ของตัวเอง" (pocket_balance) ต่อกระเป๋า ไม่ใช่ rollup — rollup ของแม่นับยอดลูก
// อยู่แล้ว บวก rollup ทุกใบจะนับยอดลูกซ้ำทุกชั้น · balance_satang รวมทุก entry ของใบนั้นครั้งเดียว
// ผลรวมข้ามใบจึง = ผลรวม entry ทั้งหมดพอดี · กรองผ่าน pocket_member ต่อผู้ใช้ (ไม่นับของคนอื่น)
//
// 🔴 สองตัวเลขใช้เกณฑ์ archived ต่างกันโดยตั้งใจ:
//   totalSatang รวม archived — rollup ของกระเป๋าแม่นับ archived อยู่แล้ว (ROADMAP: entry เก่ายังถูกนับ)
//     และ createEntry ไม่ได้ห้ามลงรายการในกระเป๋าที่ archive แล้ว ยอดจึงเกิดขึ้นจริงได้ · ถ้าตัด
//     archived ออกจากยอดรวม หน้าแรกจะไม่เท่ากับผลรวมของยอดกระเป๋าที่ผู้ใช้เห็น = ตัวเลขขัดกันเอง
//   pocketCount ไม่นับ archived — ให้ตรงกับรายการกระเป๋าที่หน้าจอเห็นโดยดีฟอลต์ (ซ่อน archived)
// จึงเป็น WHERE เดียว (สมาชิก) + แยก archived ด้วย CASE เฉพาะการนับ
export async function getSummary(db: D1Database, userId: string): Promise<Summary> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(b.balance_satang), 0)                          AS total_satang,
         SUM(CASE WHEN p.archived_at IS NULL THEN 1 ELSE 0 END)      AS pocket_count
       FROM pocket_member m
       JOIN pocket p         ON p.id = m.pocket_id
       JOIN pocket_balance b ON b.pocket_id = p.id
       WHERE m.user_id = ? AND m.left_at IS NULL`
    )
    .bind(userId)
    .first<{ total_satang: number; pocket_count: number | null }>();
  return { totalSatang: row?.total_satang ?? 0, pocketCount: row?.pocket_count ?? 0 };
}

export async function createPocket(
  db: D1Database,
  userId: string,
  input: CreatePocketInput
): Promise<PocketWithBalance> {
  // FK เช็คแค่ว่าแถวมีอยู่ ไม่ได้เช็คเจ้าของ — ถ้าไม่กันตรงนี้ ผู้ใช้จะเกาะ
  // กระเป๋า/หมวดของคนอื่นได้ผ่าน parentId/categoryId ซึ่งเป็นการรั่วข้ามผู้ใช้
  if (input.parentId != null) {
    const parent = await getPocket(db, userId, input.parentId);
    if (!parent) {
      throw new ForbiddenError('parent_not_accessible', 'กระเป๋าแม่ที่เลือกไม่ใช่ของคุณ — เลือกกระเป๋าของคุณเอง');
    }
  }
  if (input.categoryId != null) {
    const owned = await db
      .prepare('SELECT id FROM category WHERE id = ? AND user_id = ?')
      .bind(input.categoryId, userId)
      .first<{ id: string }>();
    if (!owned) {
      throw new ForbiddenError('category_not_owned', 'หมวดที่เลือกไม่ใช่ของคุณ — เลือกหมวดของคุณเองหรือปล่อยว่าง');
    }
  }

  const id = newId();
  const now = nowIso();

  // pocket กับ pocket_member ต้องเกิดพร้อมกัน ไม่งั้นกระเป๋าจะไม่มีเจ้าของ
  // แล้วไม่มีใครมองเห็นได้เลย — batch ของ D1 รับประกัน all-or-nothing
  await db.batch([
    db
      .prepare(
        `INSERT INTO pocket (id, parent_id, name, kind, category_id, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, input.parentId ?? null, input.name, input.kind, input.categoryId ?? null, input.sortOrder ?? 0, now),
    db
      .prepare(
        `INSERT INTO pocket_member (pocket_id, user_id, role, joined_at)
         VALUES (?, ?, 'owner', ?)`
      )
      .bind(id, userId, now)
  ]);

  const created = await getPocket(db, userId, id);
  if (!created) throw new Error('สร้างกระเป๋าแล้วอ่านกลับไม่เจอ — ไม่ควรเกิด');
  return created;
}

export type UpdatePocketInput = {
  name?: string;
  sortOrder?: number;
  categoryId?: string | null;
};

// แก้ได้เฉพาะ name · sortOrder · categoryId · กรองผ่าน pocket_member ที่ active เหมือน query อื่น
// (ไม่ใช่สมาชิก → ForbiddenError · ไม่มีแถวถูกแตะ) · categoryId ที่ส่งมาต้องเป็นของผู้ใช้คนเดียวกัน
// (FK เช็คแค่ว่ามีแถว ไม่เช็คเจ้าของ) · ไม่แตะ kind (enum ระบบ) · parentId (มีกฎแยก)
export async function updatePocket(
  db: D1Database,
  userId: string,
  pocketId: string,
  patch: UpdatePocketInput
): Promise<PocketWithBalance> {
  const member = await db
    .prepare('SELECT 1 AS ok FROM pocket_member WHERE pocket_id = ? AND user_id = ? AND left_at IS NULL')
    .bind(pocketId, userId)
    .first<{ ok: number }>();
  if (!member) throw new ForbiddenError('pocket_forbidden', 'กระเป๋านี้ไม่ใช่ของคุณ — แก้ไม่ได้');

  if (patch.categoryId != null) {
    const owned = await db
      .prepare('SELECT id FROM category WHERE id = ? AND user_id = ?')
      .bind(patch.categoryId, userId)
      .first<{ id: string }>();
    if (!owned) {
      throw new ForbiddenError('category_not_owned', 'หมวดที่เลือกไม่ใช่ของคุณ — เลือกหมวดของคุณเองหรือปล่อยว่าง');
    }
  }

  // set เฉพาะ field ที่ส่งมา (undefined = ไม่แตะ · categoryId = null = ล้างหมวด)
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    binds.push(patch.name);
  }
  if (patch.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    binds.push(patch.sortOrder);
  }
  if (patch.categoryId !== undefined) {
    sets.push('category_id = ?');
    binds.push(patch.categoryId);
  }
  if (sets.length > 0) {
    await db.prepare(`UPDATE pocket SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, pocketId).run();
  }

  const updated = await getPocket(db, userId, pocketId);
  if (!updated) throw new Error('แก้กระเป๋าแล้วอ่านกลับไม่เจอ — ไม่ควรเกิด');
  return updated;
}

// จัดเก็บกระเป๋า — ได้เฉพาะเมื่อยอด rollup ทั้งกิ่ง = 0 (ไม่ใช่ยอดตัวเอง)
// ธนาคารไม่รู้จักการ archive · เงินที่ยังอยู่ในบัญชีต้องถูกนับ ถ้าปล่อยให้เก็บทั้งที่มียอด
// จะเจอส่วนต่างที่อธิบายไม่ได้ทุกครั้งที่ตรวจยอด · entry เก่ายังอยู่ ยังถูกนับใน rollup ต่อไป
export async function archivePocket(db: D1Database, userId: string, pocketId: string): Promise<PocketWithBalance> {
  const pocket = await getPocket(db, userId, pocketId);
  if (!pocket) throw new ForbiddenError('pocket_forbidden', 'กระเป๋านี้ไม่ใช่ของคุณ — จัดเก็บไม่ได้');
  if (pocket.rollupSatang !== 0) {
    throw new ConflictError(
      'pocket_not_empty',
      `กระเป๋านี้ยังมีเงิน ${satangToBaht(pocket.rollupSatang)} บาท — ต้องโยกออกให้หมดก่อนจัดเก็บ`
    );
  }
  await db.prepare('UPDATE pocket SET archived_at = ? WHERE id = ?').bind(nowIso(), pocketId).run();
  const updated = await getPocket(db, userId, pocketId);
  if (!updated) throw new Error('จัดเก็บกระเป๋าแล้วอ่านกลับไม่เจอ — ไม่ควรเกิด');
  return updated;
}

export async function unarchivePocket(db: D1Database, userId: string, pocketId: string): Promise<PocketWithBalance> {
  const pocket = await getPocket(db, userId, pocketId);
  if (!pocket) throw new ForbiddenError('pocket_forbidden', 'กระเป๋านี้ไม่ใช่ของคุณ — เรียกคืนไม่ได้');
  await db.prepare('UPDATE pocket SET archived_at = NULL WHERE id = ?').bind(pocketId).run();
  const updated = await getPocket(db, userId, pocketId);
  if (!updated) throw new Error('เรียกคืนกระเป๋าแล้วอ่านกลับไม่เจอ — ไม่ควรเกิด');
  return updated;
}
