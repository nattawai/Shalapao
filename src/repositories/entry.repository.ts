import { newId, nowIso, today } from '../domain/id';

export type EntrySource = 'manual' | 'rule' | 'reconcile' | 'slip' | 'import';

export type Entry = {
  id: string;
  pocketId: string;
  createdByUserId: string;
  amountSatang: number;
  occurredOn: string;
  categoryId: string | null;
  note: string | null;
  source: EntrySource;
  transferId: string | null;
  reversesId: string | null;
  deletedAt: string | null;
  updatedAt: string | null;
  createdAt: string;
};

export type CreateEntryInput = {
  pocketId: string;
  amountSatang: number;
  occurredOn?: string;
  source?: EntrySource;
  categoryId?: string | null;
  note?: string | null;
};

export type CreateTransferInput = {
  fromPocketId: string;
  toPocketId: string;
  amountSatang: number;
  occurredOn?: string;
  note?: string | null;
};

type EntryRow = {
  id: string;
  pocket_id: string;
  created_by_user_id: string;
  amount_satang: number;
  occurred_on: string;
  category_id: string | null;
  note: string | null;
  source: EntrySource;
  transfer_id: string | null;
  reverses_id: string | null;
  deleted_at: string | null;
  updated_at: string | null;
  created_at: string;
};

// ทุก query เริ่มจาก pocket_member ที่ active เสมอ — เข้าถึง entry ได้ก็ต่อเมื่อ
// เป็นสมาชิกกระเป๋าที่ entry นั้นอยู่ · กรอง deleted_at ให้ในตัว
const SELECT_MEMBER_ENTRY = `
  SELECT
    e.id, e.pocket_id, e.created_by_user_id, e.amount_satang, e.occurred_on,
    e.category_id, e.note, e.source, e.transfer_id, e.reverses_id,
    e.deleted_at, e.updated_at, e.created_at
  FROM entry e
  JOIN pocket_member m ON m.pocket_id = e.pocket_id
  WHERE m.user_id = ? AND m.left_at IS NULL AND e.deleted_at IS NULL
`;

function mapRow(row: EntryRow): Entry {
  return {
    id: row.id,
    pocketId: row.pocket_id,
    createdByUserId: row.created_by_user_id,
    amountSatang: row.amount_satang,
    occurredOn: row.occurred_on,
    categoryId: row.category_id,
    note: row.note,
    source: row.source,
    transferId: row.transfer_id,
    reversesId: row.reverses_id,
    deletedAt: row.deleted_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at
  };
}

// FK เช็คแค่ว่าแถวมีอยู่ ไม่เช็คเจ้าของ — จึงต้องกันสิทธิ์เองที่ชั้นนี้
async function assertMember(db: D1Database, userId: string, pocketId: string): Promise<void> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM pocket_member WHERE pocket_id = ? AND user_id = ? AND left_at IS NULL')
    .bind(pocketId, userId)
    .first<{ ok: number }>();
  if (!row) throw new Error('ไม่มีสิทธิ์ในกระเป๋านี้');
}

async function assertOwnsCategory(db: D1Database, userId: string, categoryId: string): Promise<void> {
  const row = await db
    .prepare('SELECT id FROM category WHERE id = ? AND user_id = ?')
    .bind(categoryId, userId)
    .first<{ id: string }>();
  if (!row) throw new Error('categoryId ไม่ใช่หมวดของผู้ใช้');
}

export async function getEntry(db: D1Database, userId: string, entryId: string): Promise<Entry | null> {
  const row = await db
    .prepare(`${SELECT_MEMBER_ENTRY} AND e.id = ?`)
    .bind(userId, entryId)
    .first<EntryRow>();
  return row ? mapRow(row) : null;
}

export async function listEntries(db: D1Database, userId: string, pocketId: string): Promise<Entry[]> {
  const { results } = await db
    .prepare(`${SELECT_MEMBER_ENTRY} AND e.pocket_id = ? ORDER BY e.occurred_on, e.id`)
    .bind(userId, pocketId)
    .all<EntryRow>();
  return results.map(mapRow);
}

export async function createEntry(db: D1Database, userId: string, input: CreateEntryInput): Promise<Entry> {
  await assertMember(db, userId, input.pocketId);
  if (input.categoryId != null) await assertOwnsCategory(db, userId, input.categoryId);

  const id = newId();
  await db
    .prepare(
      `INSERT INTO entry (id, pocket_id, created_by_user_id, amount_satang, occurred_on, category_id, note, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.pocketId,
      userId,
      input.amountSatang,
      input.occurredOn ?? today(),
      input.categoryId ?? null,
      input.note ?? null,
      input.source ?? 'manual',
      nowIso()
    )
    .run();

  const created = await getEntry(db, userId, id);
  if (!created) throw new Error('เพิ่มรายการแล้วอ่านกลับไม่เจอ — ไม่ควรเกิด');
  return created;
}

export async function createTransfer(
  db: D1Database,
  userId: string,
  input: CreateTransferInput
): Promise<{ outflow: Entry; inflow: Entry }> {
  // ต้องเป็นสมาชิกทั้งสองกระเป๋า — โยกเข้ากระเป๋าคนอื่นไม่ได้
  await assertMember(db, userId, input.fromPocketId);
  await assertMember(db, userId, input.toPocketId);

  const transferId = newId();
  const outId = newId();
  const inId = newId();
  const occurredOn = input.occurredOn ?? today();
  const now = nowIso();

  // สองขาต้องเกิดพร้อมกัน ไม่งั้นยอดสองกระเป๋าจะไม่บาลานซ์กัน — batch = all-or-nothing
  const insert = (id: string, pocketId: string, amount: number) =>
    db
      .prepare(
        `INSERT INTO entry (id, pocket_id, created_by_user_id, amount_satang, occurred_on, note, source, transfer_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)`
      )
      .bind(id, pocketId, userId, amount, occurredOn, input.note ?? null, transferId, now);

  await db.batch([
    insert(outId, input.fromPocketId, -input.amountSatang),
    insert(inId, input.toPocketId, input.amountSatang)
  ]);

  const outflow = await getEntry(db, userId, outId);
  const inflow = await getEntry(db, userId, inId);
  if (!outflow || !inflow) throw new Error('โยกเงินแล้วอ่านกลับไม่เจอ — ไม่ควรเกิด');
  return { outflow, inflow };
}
