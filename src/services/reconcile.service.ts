import { ConflictError, ForbiddenError, ValidationError } from '../domain/errors';
import { today } from '../domain/id';
import type { Entry } from '../repositories/entry.repository';
import { applyReconcile, getBalanceAsOf, getPocket } from '../repositories/pocket.repository';

// ปุ่มเช็คยอด — หัวใจของแอป: ทำให้ตัวเลขกลับมาตรงกับธนาคารได้เสมอ
//
// ต่างจาก pocket/entry.service ที่เป็น forwarder — ชั้นนี้ถือ business rule จริงที่ SQL
// บังคับไม่ได้: กฎวันปิดงวด (SQLite date('now') เป็น UTC เชื่อไม่ได้ · ต้องใช้ today()
// เขตเวลาไทย) · การคิด diff · ลำดับปิดงวด · สิทธิ์ในกระเป๋าก่อนแตะ INSERT ดิบ

export type ReconcileInput = {
  pocketId: string;
  asOfDate: string;
  actualBalanceSatang: number;
};

export type ReconcilePreview = {
  asOfDate: string;
  expectedSatang: number;
  actualSatang: null;
  diffSatang: null;
};

export type ReconcileResult = {
  asOfDate: string;
  expectedSatang: number;
  actualSatang: number;
  diffSatang: number;
  adjustmentEntry: Entry | null;
  lastReconciledAt: string;
};

// สิทธิ์ก่อน (getPocket ผ่าน pocket_member — null = ไม่ใช่ของเรา) · แล้วกฎวัน
// เส้นต้องเป็นอดีต: วันนี้ยังไม่จบ ยอดสิ้นวันยังไม่นิ่ง · ถอยหลังกลับงวดที่ปิดแล้วไม่ได้
// แต่ asOfDate == เส้นเดิม (>=) อนุญาต — เส้นทางแก้ยอดที่กรอกผิดวันเดิม
async function assertReconcilable(
  db: D1Database,
  userId: string,
  pocketId: string,
  asOfDate: string
): Promise<void> {
  const pocket = await getPocket(db, userId, pocketId);
  if (!pocket) {
    throw new ForbiddenError('pocket_forbidden', 'ไม่มีสิทธิ์ในกระเป๋านี้ — ต้องเป็นสมาชิกก่อนจึงจะกระทบยอดได้');
  }
  if (asOfDate >= today()) {
    throw new ValidationError('reconcile_date_not_past', 'วันกระทบยอดต้องเป็นวันในอดีต — วันนี้ยังไม่จบ ยอดสิ้นวันจึงยังไม่นิ่ง');
  }
  if (pocket.lastReconciledAt !== null && asOfDate < pocket.lastReconciledAt) {
    throw new ConflictError('reconcile_reopen', `กระทบยอดถอยหลังไม่ได้ — งวดปิดถึง ${pocket.lastReconciledAt} แล้ว`);
  }
}

// อ่านอย่างเดียว: บอกยอดที่ระบบคิด ก่อนผู้ใช้กรอกยอดจริง (UI แสดง "ระบบคิดว่า X")
export async function previewReconcile(
  db: D1Database,
  userId: string,
  pocketId: string,
  asOfDate: string
): Promise<ReconcilePreview> {
  await assertReconcilable(db, userId, pocketId, asOfDate);
  const expectedSatang = await getBalanceAsOf(db, userId, pocketId, asOfDate);
  return { asOfDate, expectedSatang, actualSatang: null, diffSatang: null };
}

export async function reconcile(db: D1Database, userId: string, input: ReconcileInput): Promise<ReconcileResult> {
  await assertReconcilable(db, userId, input.pocketId, input.asOfDate);
  const expectedSatang = await getBalanceAsOf(db, userId, input.pocketId, input.asOfDate);
  const diffSatang = input.actualBalanceSatang - expectedSatang;
  // applyReconcile ทำ INSERT ปรับ (ถ้า diff≠0) + ปิดงวด ใน batch เดียว (atomic)
  const adjustmentEntry = await applyReconcile(db, userId, {
    pocketId: input.pocketId,
    asOfDate: input.asOfDate,
    diffSatang
  });
  return {
    asOfDate: input.asOfDate,
    expectedSatang,
    actualSatang: input.actualBalanceSatang,
    diffSatang,
    adjustmentEntry,
    lastReconciledAt: input.asOfDate
  };
}
