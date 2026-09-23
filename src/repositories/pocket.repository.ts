import { ForbiddenError } from '../domain/errors';
import { newId, nowIso } from '../domain/id';

export type PocketKind = 'holds_balance' | 'flow_through';
export type MemberRole = 'owner' | 'editor' | 'viewer';

export type PocketWithBalance = {
  id: string;
  parentId: string | null;
  name: string;
  kind: PocketKind;
  categoryId: string | null;
  sortOrder: number;
  lastReconciledAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  role: MemberRole;
  balanceSatang: number;
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
  last_reconciled_at: string | null;
  archived_at: string | null;
  created_at: string;
  role: MemberRole;
  balance_satang: number;
  entry_count: number;
  last_entry_on: string | null;
};

// จุดเดียวที่ยัด user filter: เริ่มจาก pocket_member ที่ยัง active เสมอ
// ไม่มีทางเขียน query ที่อ้าง pocket_id ตรง ๆ โดยลืมสิทธิ์ เพราะทุกเมธอดต่อจากนี้
// ยอดคงเหลืออ่านจาก view pocket_balance ไม่คำนวณเองในโค้ด (ข้อตกลงข้อ 4)
const SELECT_MEMBER_POCKET = `
  SELECT
    p.id, p.parent_id, p.name, p.kind, p.category_id, p.sort_order,
    p.last_reconciled_at, p.archived_at, p.created_at,
    m.role,
    b.balance_satang, b.entry_count, b.last_entry_on
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
    lastReconciledAt: row.last_reconciled_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    role: row.role,
    balanceSatang: row.balance_satang,
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
    .bind(userId)
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
    .bind(userId, pocketId)
    .first<PocketRow>();
  return row ? mapRow(row) : null;
}

// ยอด ณ สิ้นวัน asOfDate — ต่างจาก view pocket_balance ที่รวมทุกแถวไม่มีเงื่อนไขวัน
// กระทบยอดต้องเทียบยอด "ณ วันปิดงวด" (อดีตเสมอ) กับธนาคาร จึงตัดรายการของวันหลังทิ้ง
// SUM ที่ SQL ไม่ดึงทุกแถวมาบวกใน JS · เริ่มจาก pocket_member เหมือนทุก query —
// คนที่ไม่ใช่สมาชิกได้ 0 (COALESCE) ไม่มีทางเห็นยอดจริงของกระเป๋าคนอื่น
export async function getBalanceAsOf(
  db: D1Database,
  userId: string,
  pocketId: string,
  asOfDate: string
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(e.amount_satang), 0) AS balance
       FROM pocket_member m
       JOIN entry e ON e.pocket_id = m.pocket_id
       WHERE m.user_id = ? AND m.left_at IS NULL
         AND m.pocket_id = ? AND e.occurred_on <= ? AND e.deleted_at IS NULL`
    )
    .bind(userId, pocketId, asOfDate)
    .first<{ balance: number }>();
  return row?.balance ?? 0;
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
