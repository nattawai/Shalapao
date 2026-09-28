import { NotFoundError } from '../domain/errors';
import { nowIso } from '../domain/id';

export type ReconcileRecord = {
  id: string;
  pocketId: string;
  reconciledBy: string;
  asOfDate: string;
  expectedSatang: number;
  actualSatang: number;
  adjustmentId: string | null;
  previousLine: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

type ReconcileRow = {
  id: string;
  pocket_id: string;
  reconciled_by: string;
  as_of_date: string;
  expected_satang: number;
  actual_satang: number;
  adjustment_id: string | null;
  previous_line: string | null;
  cancelled_at: string | null;
  created_at: string;
};

function mapRow(row: ReconcileRow): ReconcileRecord {
  return {
    id: row.id,
    pocketId: row.pocket_id,
    reconciledBy: row.reconciled_by,
    asOfDate: row.as_of_date,
    expectedSatang: row.expected_satang,
    actualSatang: row.actual_satang,
    adjustmentId: row.adjustment_id,
    previousLine: row.previous_line,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at
  };
}

// ครั้งล่าสุดที่ยังไม่ถูกยกเลิก · กรองผ่าน pocket_member เหมือนทุก query (ไม่ใช่สมาชิก → null)
// เรียงตาม created_at ล่าสุด (tie-break id) = ยอด "บนสุดของกอง" ที่จะถอยก่อน · การถอยซ้ำจะได้
// แถวถัดลงไปเองเพราะแถวที่ยกเลิกแล้วถูกตัดด้วย cancelled_at IS NULL
export async function getLastReconcile(db: D1Database, userId: string, pocketId: string): Promise<ReconcileRecord | null> {
  const row = await db
    .prepare(
      `SELECT r.id, r.pocket_id, r.reconciled_by, r.as_of_date, r.expected_satang, r.actual_satang,
              r.adjustment_id, r.previous_line, r.cancelled_at, r.created_at
       FROM pocket_reconcile r
       JOIN pocket_member m ON m.pocket_id = r.pocket_id AND m.user_id = ? AND m.left_at IS NULL
       WHERE r.pocket_id = ? AND r.cancelled_at IS NULL
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 1`
    )
    .bind(userId, pocketId)
    .first<ReconcileRow>();
  return row ? mapRow(row) : null;
}

// กระเป๋าแม่ชั้นใดที่ "ปิดคลุม" วัน asOfDate ที่จะยกเลิก (last_reconciled_at >= asOfDate)
// ถ้ามี = ยกเลิกลูกไม่ได้ ต้องยกเลิกแม่ก่อน (จากบนลงล่าง) — ไม่งั้นลงรายการย้อนหลังในลูกได้
// แล้ว rollup ของแม่ ณ วันที่แม่ยืนยันจะเปลี่ยน · คืน "ชั้นบนสุด" (ancestor ที่มีบรรพบุรุษน้อยสุด)
// เพราะต้องยกเลิกจากบนสุดก่อน · ไม่กรอง member เพราะเป็นด่าน integrity (เหมือน assertNotReconciled)
export async function findLockingAncestor(
  db: D1Database,
  pocketId: string,
  asOfDate: string
): Promise<{ name: string; lastReconciledAt: string } | null> {
  const row = await db
    .prepare(
      `SELECT anc.name AS name, anc.last_reconciled_at AS line
       FROM pocket_subtree st
       JOIN pocket anc ON anc.id = st.root_id
       WHERE st.node_id = ? AND st.root_id <> ?
         AND anc.last_reconciled_at IS NOT NULL
         AND anc.last_reconciled_at >= ?
       ORDER BY (SELECT COUNT(*) FROM pocket_subtree s2 WHERE s2.node_id = anc.id) ASC
       LIMIT 1`
    )
    .bind(pocketId, pocketId, asOfDate)
    .first<{ name: string; line: string }>();
  return row ? { name: row.name, lastReconciledAt: row.line } : null;
}

// ยกเลิกการตรวจยอดหนึ่งครั้ง — batch เดียว (all-or-nothing):
//   cancelled_at ที่แถวประวัติ · soft delete รายการปรับ (ถ้ามี) · คืนเส้นเป็น previous_line (NULL ได้)
// กรองผ่าน pocket_member เอง (ด่านชดเชย) · previous_line/adjustment_id อ่านจากแถวตรง ๆ ไม่คำนวณ
export async function cancelReconcile(db: D1Database, userId: string, reconcileId: string): Promise<void> {
  const row = await db
    .prepare(
      `SELECT r.pocket_id, r.adjustment_id, r.previous_line, r.cancelled_at
       FROM pocket_reconcile r
       JOIN pocket_member m ON m.pocket_id = r.pocket_id AND m.user_id = ? AND m.left_at IS NULL
       WHERE r.id = ?`
    )
    .bind(userId, reconcileId)
    .first<{ pocket_id: string; adjustment_id: string | null; previous_line: string | null; cancelled_at: string | null }>();
  if (!row || row.cancelled_at !== null) {
    throw new NotFoundError('reconcile_not_found', 'ยังไม่เคยตรวจยอดกระเป๋านี้ จึงไม่มีอะไรให้ยกเลิก');
  }

  const now = nowIso();
  const ops: D1PreparedStatement[] = [
    db.prepare('UPDATE pocket_reconcile SET cancelled_at = ? WHERE id = ?').bind(now, reconcileId),
    db.prepare('UPDATE pocket SET last_reconciled_at = ? WHERE id = ?').bind(row.previous_line, row.pocket_id)
  ];
  if (row.adjustment_id !== null) {
    ops.push(db.prepare('UPDATE entry SET deleted_at = ? WHERE id = ?').bind(now, row.adjustment_id));
  }
  await db.batch(ops);
}
