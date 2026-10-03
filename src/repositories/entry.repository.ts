import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors';
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
  if (!row) throw new ForbiddenError('pocket_forbidden', 'ไม่มีสิทธิ์ในกระเป๋านี้ — ต้องเป็นสมาชิกก่อนจึงจะทำรายการได้');
}

async function assertOwnsCategory(db: D1Database, userId: string, categoryId: string): Promise<void> {
  const row = await db
    .prepare('SELECT id FROM category WHERE id = ? AND user_id = ?')
    .bind(categoryId, userId)
    .first<{ id: string }>();
  if (!row) throw new ForbiddenError('category_not_owned', 'หมวดที่เลือกไม่ใช่ของคุณ — เลือกหมวดของคุณเองหรือปล่อยว่าง');
}

// ข้อตกลงข้อ 6: ห้ามลงรายการทับงวดที่กระทบยอดแล้ว — occurred_on <= เส้น = ปฏิเสธ
// เส้นเป็นวันที่ปิดงวดแล้วเสมอ (ห้ามวันนี้/อนาคต — reconcile.service กันตอนตั้ง)
// จึงไม่บล็อกรายการของวันนี้ · trigger (0007) การันตีเส้นเป็น YYYY-MM-DD → เทียบ
// string ได้ตรงลำดับเวลา · การ insert เกิดที่ไฟล์นี้ที่เดียว ด่านจึงต้องอยู่ตรงนี้
//
// 🔴 ต้องดูเส้นของกระเป๋านี้ + แม่ทุกชั้น (ผ่าน pocket_subtree) แล้วใช้เส้นที่ใหม่ที่สุด
// เพราะ reconcile ทำงานระดับ rollup (ยอดแม่ = ตัวเอง + ลูก) — ลงรายการย้อนหลังในลูก
// จะเปลี่ยน rollup ของแม่ ณ วันที่แม่ปิดงวด = ทำให้การกระทบยอดของแม่เป็นโมฆะเงียบ ๆ
// (pocket_subtree: node_id = กระเป๋านี้ → root_id ไล่ขึ้นไปถึงตัวเอง+แม่ทุกชั้น)
// เส้นกระทบยอดที่บังคับกับกระเป๋านี้ = เส้นที่ใหม่ที่สุดของตัวเอง + แม่ทุกชั้น
// ใช้ซ้ำทั้งตอนลงรายการ (assertNotReconciled) และตอนลบรายการ (deleteEntry) — ตรรกะเดียว
async function effectiveReconciledLine(db: D1Database, pocketId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT MAX(p.last_reconciled_at) AS line
       FROM pocket_subtree st
       JOIN pocket p ON p.id = st.root_id
       WHERE st.node_id = ?`
    )
    .bind(pocketId)
    .first<{ line: string | null }>();
  return row?.line ?? null;
}

async function assertNotReconciled(db: D1Database, pocketId: string, occurredOn: string): Promise<void> {
  const line = await effectiveReconciledLine(db, pocketId);
  if (line !== null && occurredOn <= line) {
    throw new ConflictError(
      'reconciled_period',
      `ลงรายการในงวดที่กระทบยอดแล้วไม่ได้ (ถึง ${line}) — ออกรายการปรับของวันนี้แทน`
    );
  }
}

// ลบได้เฉพาะงวดที่ยังไม่ปิด · งวดปิดแล้ว = การกระทบยอดปรับยอดรวมไปแล้ว ถ้ามาลบต้นทางอีก
// = หักลบซ้ำสองรอบ (บั๊กนับซ้ำที่ last_reconciled_at ออกแบบมากันตั้งแต่แรก)
async function assertDeletableInOpenPeriod(db: D1Database, pocketId: string, occurredOn: string): Promise<void> {
  const line = await effectiveReconciledLine(db, pocketId);
  if (line !== null && occurredOn <= line) {
    throw new ConflictError(
      'reconciled_period',
      'รายการนี้อยู่ในงวดที่กระทบยอดแล้ว แก้ไม่ได้ — การกระทบยอดปรับยอดรวมให้ถูกไปแล้ว'
    );
  }
}

export async function getEntry(db: D1Database, userId: string, entryId: string): Promise<Entry | null> {
  const row = await db
    .prepare(`${SELECT_MEMBER_ENTRY} AND e.id = ?`)
    .bind(userId, entryId)
    .first<EntryRow>();
  return row ? mapRow(row) : null;
}

export type EntryCounterpart = { counterpartPocketId: string | null; counterpartPocketName: string | null };
export type EntryWithCounterpart = Entry & EntryCounterpart;
export type EntryWithPocket = EntryWithCounterpart & { pocketName: string };

type CounterpartRow = { counterpart_pocket_id: string | null; counterpart_pocket_name: string | null };

function mapCounterpart(row: CounterpartRow): EntryCounterpart {
  return { counterpartPocketId: row.counterpart_pocket_id, counterpartPocketName: row.counterpart_pocket_name };
}

// ขาคู่ของการโยกเงินอยู่ "คนละกระเป๋า" กับที่ query จึงไม่อยู่ในผลลัพธ์ — ต้องดึงชื่อมาด้วย LEFT JOIN
// ให้หน้าเดินบัญชีบอกได้ว่าโยกคู่กับกระเป๋าไหน โดยไม่ต้องไล่เทียบวัน/จำนวนเอง · ใช้ชื่อ "ปัจจุบัน"
// ของกระเป๋าเสมอ (ไม่เก็บลงตาราง entry — เปลี่ยนชื่อแล้วต้องเห็นใหม่ทันที)
//
// 🔴 ผูก cp ผ่าน cm (membership ของ "ผู้เรียก" บนกระเป๋าขาคู่) — ถ้าไม่ได้เป็นสมาชิก cm ไม่ติด
//    cp ก็ไม่ติด ทั้ง id และ name จึงเป็น null พร้อมกัน · ชื่อ/ตัวตนกระเป๋าของคนอื่นไม่รั่วผ่าน field นี้
//    (จะเกิดได้ตอนกระเป๋าร่วม v3: โยกที่สองขาคนละเจ้าของ)
// transfer มี 2 ขาเสมอ + other.id <> e.id → ได้ขาคู่แถวเดียว ไม่ทำผลลัพธ์บาน · รายการธรรมดา
//    transfer_id เป็น NULL → เงื่อนไข NULL = NULL ไม่ match เอง counterpart จึงว่างอัตโนมัติ
// ไม่กรอง other.deleted_at: ลบโยกเงินลบทั้งคู่ (deleteEntry) และ replaceEntry ปฏิเสธขาโยก —
//    ถ้าแถวนี้ยังอยู่ ขาคู่ก็ยังอยู่เสมอ การกรองจึงไม่เปลี่ยนผลแต่เพิ่มความซับซ้อน
// 🔴 ต้อง bind userId เพิ่มหนึ่งตัวสำหรับ cm.user_id (วาง ? ไว้ก่อน placeholder ของ WHERE)
const COUNTERPART_SELECT = 'cp.id AS counterpart_pocket_id, cp.name AS counterpart_pocket_name';
// 🔴 ข้อสมมติ "transfer มี 2 ขา" (ทำให้ได้ขาคู่แถวเดียว) จะพังถ้าทำฟีเจอร์ "โยกไปหลายกระเป๋าใน
// ครั้งเดียว" (BACKLOG 2026-09-30) แบบใช้ transfer_id เดียวต่อหลายขา — ตอนนั้น LEFT JOIN นี้จะคืน
// ขาคู่หลายแถว ทำให้แถวรายการ "ซ้ำ" ในหน้าเดินบัญชี ไม่ใช่แค่ counterpart ผิด แต่ยอดที่ผู้ใช้เห็น
// จะเกินจริง · ทางเลี่ยงตอนนั้น: ออกแบบเป็น transfer แยกกันต่อปลายทาง หรือเติม GROUP BY/LIMIT ที่นี่
const COUNTERPART_JOIN = `
  LEFT JOIN entry other      ON other.transfer_id = e.transfer_id AND other.id <> e.id
  LEFT JOIN pocket_member cm ON cm.pocket_id = other.pocket_id AND cm.user_id = ? AND cm.left_at IS NULL
  LEFT JOIN pocket cp        ON cp.id = cm.pocket_id`;

export async function listEntries(db: D1Database, userId: string, pocketId: string): Promise<EntryWithCounterpart[]> {
  const { results } = await db
    .prepare(
      `SELECT
         e.id, e.pocket_id, e.created_by_user_id, e.amount_satang, e.occurred_on,
         e.category_id, e.note, e.source, e.transfer_id, e.reverses_id,
         e.deleted_at, e.updated_at, e.created_at,
         ${COUNTERPART_SELECT}
       FROM entry e
       JOIN pocket_member m ON m.pocket_id = e.pocket_id AND m.user_id = ? AND m.left_at IS NULL
       ${COUNTERPART_JOIN}
       WHERE e.deleted_at IS NULL AND e.pocket_id = ?
       ORDER BY e.occurred_on, e.id`
    )
    .bind(userId, userId, pocketId)
    .all<EntryRow & CounterpartRow>();
  return results.map((row) => ({ ...mapRow(row), ...mapCounterpart(row) }));
}

// รายการของกระเป๋านี้ + ลูกทุกชั้น (ไล่ต้นไม้จาก view pocket_subtree) เรียงตามวัน
// 🔴 กรอง pocket_member ต่อ node เหมือน rollup (permissive) — ลูกที่ผู้ใช้ไม่ได้เป็นสมาชิก
// จะไม่โผล่ · กระเป๋าที่ไม่ใช่ของผู้ใช้เลย → JOIN ไม่ติด → [] (ไม่ใช่ 404 เหมือน listEntries)
// คืน pocketName ต่อแถวเพราะรายการมาจากหลายกระเป๋า หน้าจอต้องรู้ว่าแถวไหนของใบไหน
// counterpart ใส่ด้วยเหมือนโหมดปกติ — ?subtree=1 เป็น flag ของ endpoint เดียวกัน การโยกออก
// นอกสาขาจะเห็นขาเดียว จึงต้องมี counterpart ไม่งั้นหน้าจอต้องรู้ว่าโหมดไหนมี field โหมดไหนไม่มี
export async function listSubtreeEntries(db: D1Database, userId: string, pocketId: string): Promise<EntryWithPocket[]> {
  const { results } = await db
    .prepare(
      `SELECT
         e.id, e.pocket_id, e.created_by_user_id, e.amount_satang, e.occurred_on,
         e.category_id, e.note, e.source, e.transfer_id, e.reverses_id,
         e.deleted_at, e.updated_at, e.created_at,
         p.name AS pocket_name,
         ${COUNTERPART_SELECT}
       FROM pocket_subtree st
       JOIN pocket_member m ON m.pocket_id = st.node_id AND m.user_id = ? AND m.left_at IS NULL
       JOIN entry e         ON e.pocket_id = st.node_id AND e.deleted_at IS NULL
       JOIN pocket p        ON p.id = e.pocket_id
       ${COUNTERPART_JOIN}
       WHERE st.root_id = ?
       ORDER BY e.occurred_on, e.id`
    )
    .bind(userId, userId, pocketId)
    .all<EntryRow & { pocket_name: string } & CounterpartRow>();
  return results.map((row) => ({ ...mapRow(row), pocketName: row.pocket_name, ...mapCounterpart(row) }));
}

export type CategoryBucket = { inflowSatang: number; outflowSatang: number; entryCount: number };
export type CategorySummaryRow = CategoryBucket & { categoryId: string; categoryName: string };
export type CategorySummary = {
  rows: CategorySummaryRow[];
  uncategorized: CategoryBucket;
  totalInflowSatang: number;
  totalOutflowSatang: number;
};

type CategoryGroupRow = {
  category_id: string | null;
  category_name: string | null;
  inflow_satang: number;
  outflow_satang: number;
  entry_count: number;
};

// สรุปเงินเข้า/ออกรายหมวดในช่วง [from, to] (รวมปลายทั้งสองข้าง) — "ช่วงนี้จ่ายหมวดไหนเท่าไร"
//
// 🔴 ไม่นับขาโยกเงิน (transfer_id IS NULL): โยก 5,000 จาก A→B สร้าง entry คู่ (−5,000/+5,000)
// เงินไม่ได้ออกจากมือ แค่ย้ายที่ ถ้านับจะโป่งทั้ง inflow และ outflow เท่า ๆ กันด้วยยอดที่ไม่เคยเกิด
// 🔴 ไม่นับที่ลบแล้ว (deleted_at IS NULL) · 🔴 เริ่มจาก pocket_member ต่อผู้ใช้ (ไม่เห็นของคนอื่น)
// inflow/outflow เป็นจำนวนเต็มบวกทั้งคู่ (outflow คืน −amount) ให้ UI ไม่ต้องคิดเครื่องหมายเอง
//
// total คิดแยก query แล้วยิงคู่กับ group ใน db.batch เดียว (D1 = transaction โดยปริยาย) เพื่อให้
// ทั้งสองเห็น snapshot เดียวกัน — ถ้ายิงแยกแล้วมีการเขียนแทรกกลางคัน สมการ Σrows == total จะพังเงียบ ๆ
export async function summarizeByCategory(
  db: D1Database,
  userId: string,
  from: string,
  to: string
): Promise<CategorySummary> {
  const source = 'FROM pocket_member m JOIN entry e ON e.pocket_id = m.pocket_id';
  const filters = `WHERE m.user_id = ? AND m.left_at IS NULL
      AND e.transfer_id IS NULL AND e.deleted_at IS NULL
      AND e.occurred_on >= ? AND e.occurred_on <= ?`;
  const inflow = 'COALESCE(SUM(CASE WHEN e.amount_satang > 0 THEN e.amount_satang ELSE 0 END), 0)';
  const outflow = 'COALESCE(SUM(CASE WHEN e.amount_satang < 0 THEN -e.amount_satang ELSE 0 END), 0)';

  // 🔴 LEFT JOIN category ให้ชื่อหมวดจาก id ของ "คนใส่รายการ" — v0 คนใส่ = เจ้าของเสมอจึงปลอดภัย
  // 🔴 ต้องกลับมาดูตอนทำกระเป๋าร่วม (v3): ถ้า Bob ลงรายการติดหมวดของ Bob ในกระเป๋าร่วม Alice
  // เปิดหน้าสรุปจะเห็นชื่อหมวดของ Bob (ช่องรั่วข้ามผู้ใช้เดียวกับ rollup) — ตอนนั้นต้องกรอง c.user_id
  // tiebreak category_name/category_id เพื่อให้ลำดับคงที่เมื่อ outflow เท่ากัน (ไม่งั้นเทส flaky)
  const groupStmt = db
    .prepare(
      `SELECT e.category_id AS category_id, c.name AS category_name,
              ${inflow} AS inflow_satang, ${outflow} AS outflow_satang, COUNT(*) AS entry_count
       ${source}
       LEFT JOIN category c ON c.id = e.category_id
       ${filters}
       GROUP BY e.category_id
       ORDER BY outflow_satang DESC, category_name ASC, category_id ASC`
    )
    .bind(userId, from, to);
  const totalStmt = db
    .prepare(`SELECT ${inflow} AS total_inflow, ${outflow} AS total_outflow ${source} ${filters}`)
    .bind(userId, from, to);

  const batch = await db.batch([groupStmt, totalStmt]);
  const groups = (batch[0]?.results ?? []) as CategoryGroupRow[];
  const totals = ((batch[1]?.results ?? []) as { total_inflow: number; total_outflow: number }[])[0];

  const rows: CategorySummaryRow[] = [];
  let uncategorized: CategoryBucket = { inflowSatang: 0, outflowSatang: 0, entryCount: 0 };
  for (const g of groups) {
    const bucket: CategoryBucket = { inflowSatang: g.inflow_satang, outflowSatang: g.outflow_satang, entryCount: g.entry_count };
    if (g.category_id === null) {
      uncategorized = bucket;
    } else {
      rows.push({ categoryId: g.category_id, categoryName: g.category_name ?? '', ...bucket });
    }
  }
  return {
    rows,
    uncategorized,
    totalInflowSatang: totals?.total_inflow ?? 0,
    totalOutflowSatang: totals?.total_outflow ?? 0
  };
}

export type UpdateEntryLabelsInput = { note?: string | null; categoryId?: string | null };

// PATCH ป้ายเท่านั้น — แก้ได้แค่ note, categoryId (UPDATE แถวเดิม) · ประทับ updated_at
// 🔴 ไม่แตะ amount_satang/occurred_on/pocket_id เด็ดขาด · จึงทำได้แม้ในงวดที่กระทบยอดแล้ว
// (ไม่แตะตัวเลข/วัน → ยอดที่ยืนยันไม่เปลี่ยน) · ติดหมวดย้อนหลังกับข้อมูลเก่าได้เพื่อ dashboard
export async function updateEntryLabels(
  db: D1Database,
  userId: string,
  entryId: string,
  patch: UpdateEntryLabelsInput
): Promise<Entry> {
  const row = await db
    .prepare('SELECT pocket_id, deleted_at FROM entry WHERE id = ?')
    .bind(entryId)
    .first<{ pocket_id: string; deleted_at: string | null }>();
  if (!row) throw new NotFoundError('entry_not_found', 'ไม่พบรายการนี้');
  await assertMember(db, userId, row.pocket_id); // ไม่ใช่สมาชิก → ForbiddenError (แถวยังอยู่)
  if (row.deleted_at !== null) throw new NotFoundError('entry_not_found', 'ไม่พบรายการนี้ (ถูกลบไปแล้ว)');
  if (patch.categoryId != null) await assertOwnsCategory(db, userId, patch.categoryId);

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (patch.note !== undefined) {
    sets.push('note = ?');
    binds.push(patch.note);
  }
  if (patch.categoryId !== undefined) {
    sets.push('category_id = ?');
    binds.push(patch.categoryId);
  }
  sets.push('updated_at = ?');
  binds.push(nowIso());
  await db.prepare(`UPDATE entry SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, entryId).run();

  const updated = await getEntry(db, userId, entryId);
  if (!updated) throw new Error('แก้ป้ายรายการแล้วอ่านกลับไม่เจอ — ไม่ควรเกิด');
  return updated;
}

export async function createEntry(db: D1Database, userId: string, input: CreateEntryInput): Promise<Entry> {
  await assertMember(db, userId, input.pocketId);
  if (input.categoryId != null) await assertOwnsCategory(db, userId, input.categoryId);

  const occurredOn = input.occurredOn ?? today();
  await assertNotReconciled(db, input.pocketId, occurredOn);

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
      occurredOn,
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
  // ทิศทางกำหนดด้วยต้นทาง/ปลายทาง จำนวนจึงต้องเป็นบวกเสมอ · ยอดติดลบไหลย้อน
  // (−(−n) เข้าต้นทาง) โดย DB CHECK amount <> 0 จับไม่ได้ · 0 DB จับอยู่แล้ว
  if (input.amountSatang <= 0) {
    throw new ValidationError('transfer_amount_positive', 'จำนวนเงินโยกต้องมากกว่า 0 — ทิศทางกำหนดด้วยต้นทาง/ปลายทาง ไม่ใช่เครื่องหมาย');
  }
  // โยกเข้ากระเป๋าเดียวกัน = สองแถวหักล้างกันในกระเป๋าเดียว = ledger ขยะ
  if (input.fromPocketId === input.toPocketId) {
    throw new ValidationError('same_pocket_transfer', 'โยกเข้ากระเป๋าเดียวกันไม่ได้ — เลือกกระเป๋าปลายทางอื่น');
  }

  // ต้องเป็นสมาชิกทั้งสองกระเป๋า — โยกเข้ากระเป๋าคนอื่นไม่ได้
  await assertMember(db, userId, input.fromPocketId);
  await assertMember(db, userId, input.toPocketId);

  const occurredOn = input.occurredOn ?? today();
  // เช็คทั้งสองกระเป๋า — แต่ละใบมีเส้นกระทบยอดของตัวเอง โยกทับงวดที่ปิดแล้วของ
  // ฝั่งใดฝั่งหนึ่งก็ทำให้ยอดที่ยืนยันแล้วเพี้ยน
  await assertNotReconciled(db, input.fromPocketId, occurredOn);
  await assertNotReconciled(db, input.toPocketId, occurredOn);

  const transferId = newId();
  const outId = newId();
  const inId = newId();
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

// v0 ลบ = soft delete (ประทับ deleted_at เป็นเวลาที่กด ไม่ใช่วันที่ของรายการ) ไม่มี reversal
// อ่านแถวดิบก่อนเพื่อแยก 404 (ไม่มี/ถูกลบแล้ว) จาก 403 (ไม่ใช่สมาชิก) — getEntry รวมสองเงื่อนไข
// เข้าด้วยกันจึงแยกไม่ได้ · ขาโยกเงินต้องลบทั้งคู่ใน batch เดียว และเช็คงวดปิดของทั้งสองกระเป๋าก่อน
export async function deleteEntry(db: D1Database, userId: string, entryId: string): Promise<void> {
  const row = await db
    .prepare('SELECT pocket_id, transfer_id, occurred_on, deleted_at FROM entry WHERE id = ?')
    .bind(entryId)
    .first<{ pocket_id: string; transfer_id: string | null; occurred_on: string; deleted_at: string | null }>();
  if (!row) throw new NotFoundError('entry_not_found', 'ไม่พบรายการนี้');
  await assertMember(db, userId, row.pocket_id); // ไม่ใช่สมาชิก → ForbiddenError (แถวยังอยู่)
  if (row.deleted_at !== null) throw new NotFoundError('entry_not_found', 'ไม่พบรายการนี้ (ถูกลบไปแล้ว)');

  const now = nowIso();
  if (row.transfer_id === null) {
    await assertDeletableInOpenPeriod(db, row.pocket_id, row.occurred_on);
    await db.prepare('UPDATE entry SET deleted_at = ? WHERE id = ?').bind(now, entryId).run();
    return;
  }

  // ขาโยกเงิน: ลบทั้งสองขา · เช็คงวดปิดของทุกขาก่อน ถ้าฝั่งใดปิดแล้ว → ปฏิเสธ ไม่ลบทั้งคู่
  const legs = await db
    .prepare('SELECT id, pocket_id, occurred_on FROM entry WHERE transfer_id = ? AND deleted_at IS NULL')
    .bind(row.transfer_id)
    .all<{ id: string; pocket_id: string; occurred_on: string }>();
  for (const leg of legs.results) {
    await assertDeletableInOpenPeriod(db, leg.pocket_id, leg.occurred_on);
  }
  await db.batch(legs.results.map((leg) => db.prepare('UPDATE entry SET deleted_at = ? WHERE id = ?').bind(now, leg.id)));
}

export type ReplaceEntryInput = {
  pocketId: string;
  amountSatang: number;
  occurredOn: string;
  note?: string | null;
  categoryId?: string | null;
};

// แก้ยอด/วัน/กระเป๋า = soft delete แถวเดิม + สร้างแถวใหม่ ใน batch เดียว (ไม่แก้ตัวเลขแถวเดิม
// เลย — เก็บร่องรอยไว้) · 🔴 เช็ค assertNotReconciled สองครั้ง: แถวเดิม (กระเป๋า+วันเดิม) เพราะการ
// ลบมันกระทบยอดของงวดที่ตรวจแล้ว · แถวใหม่ (กระเป๋า+วันใหม่) เพราะเป็นการลงรายการใหม่
// ขาโยกเงิน (transfer_id) แก้ทางนี้ไม่ได้ — input รายเดียวอธิบายคู่โยกไม่ได้ · ให้ลบแล้วโยกใหม่
export async function replaceEntry(
  db: D1Database,
  userId: string,
  entryId: string,
  input: ReplaceEntryInput
): Promise<Entry> {
  const row = await db
    .prepare('SELECT pocket_id, transfer_id, occurred_on, deleted_at FROM entry WHERE id = ?')
    .bind(entryId)
    .first<{ pocket_id: string; transfer_id: string | null; occurred_on: string; deleted_at: string | null }>();
  if (!row) throw new NotFoundError('entry_not_found', 'ไม่พบรายการนี้');
  await assertMember(db, userId, row.pocket_id); // สิทธิ์กระเป๋าเดิม
  if (row.deleted_at !== null) throw new NotFoundError('entry_not_found', 'ไม่พบรายการนี้ (ถูกลบไปแล้ว)');
  if (row.transfer_id !== null) {
    throw new ValidationError(
      'transfer_not_replaceable',
      'รายการนี้เป็นการโยกเงิน แก้ยอด/วัน/กระเป๋าตรง ๆ ไม่ได้ — ลบแล้วโยกใหม่'
    );
  }
  await assertMember(db, userId, input.pocketId); // สิทธิ์กระเป๋าใหม่ (เผื่อย้ายกระเป๋า)
  if (input.categoryId != null) await assertOwnsCategory(db, userId, input.categoryId);

  await assertNotReconciled(db, row.pocket_id, row.occurred_on); // ลบแถวเดิมกระทบงวดเดิม
  await assertNotReconciled(db, input.pocketId, input.occurredOn); // แถวใหม่ลงงวดใหม่

  const now = nowIso();
  const newRowId = newId();
  await db.batch([
    db.prepare('UPDATE entry SET deleted_at = ? WHERE id = ?').bind(now, entryId),
    db
      .prepare(
        `INSERT INTO entry (id, pocket_id, created_by_user_id, amount_satang, occurred_on, category_id, note, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?)`
      )
      .bind(newRowId, input.pocketId, userId, input.amountSatang, input.occurredOn, input.categoryId ?? null, input.note ?? null, now)
  ]);

  const created = await getEntry(db, userId, newRowId);
  if (!created) throw new Error('แก้รายการแล้วอ่านกลับไม่เจอ — ไม่ควรเกิด');
  return created;
}
