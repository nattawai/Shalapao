import { z } from 'zod';

// DB CHECK เช็คแค่โครง '____-__-__' → '2026-99-99' ลอดผ่านได้ · ที่ขอบต้องเช็ค
// "เป็นวันที่จริง" ด้วย: parse แล้ว format กลับต้องได้ค่าเดิม (จับ 2026-99-99, 2026-02-30)
function isRealYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const occurredOn = z.string().refine(isRealYmd, 'วันที่ต้องเป็น YYYY-MM-DD ที่มีอยู่จริง');

// amountSatang เป็น integer เท่านั้น — ทศนิยมคือสัญญาณว่า client คำนวณเป็นบาทแล้วแปลงผิด
const amountInt = z
  .number({ error: 'ต้องมีจำนวนเงิน (หน่วยสตางค์)' })
  .int('จำนวนเงินต้องเป็นสตางค์จำนวนเต็ม ไม่มีทศนิยม');

// note ลง D1 ตรง ๆ — จำกัดความยาวกันยัดสตริงยาวไม่จำกัด
const note = z.string().max(500, 'บันทึกยาวเกินไป (ไม่เกิน 500 ตัวอักษร)');

export const createEntrySchema = z
  .object({
    pocketId: z.string().min(1),
    amountSatang: amountInt.refine((n) => n !== 0, 'จำนวนเงินต้องไม่เป็น 0 (บวก = เงินเข้า, ลบ = เงินออก)'),
    occurredOn: occurredOn.optional(),
    categoryId: z.string().min(1).optional(),
    note: note.optional()
  })
  .strict();

export const createTransferSchema = z
  .object({
    fromPocketId: z.string().min(1),
    toPocketId: z.string().min(1),
    amountSatang: amountInt.refine((n) => n > 0, 'จำนวนเงินโยกต้องมากกว่า 0 — ทิศทางกำหนดด้วยต้นทาง/ปลายทาง'),
    occurredOn: occurredOn.optional(),
    note: note.optional()
  })
  .strict();
