import { z } from 'zod';
import { isRealYmd } from './shared';

const ymd = z.string().refine(isRealYmd, 'วันที่ต้องเป็น YYYY-MM-DD ที่มีอยู่จริง');

// from/to มาทาง query · ไม่ส่งทั้งคู่ = เดือนปัจจุบัน (route เติมให้) · ปฏิเสธ field ที่ไม่รู้จัก
// ต้องส่งคู่กัน (ช่วงครึ่งเดียวตีความไม่ได้) · from ต้องไม่เกิน to
export const summaryByCategoryQuerySchema = z
  .object({ from: ymd.optional(), to: ymd.optional() })
  .strict()
  .refine((q) => (q.from === undefined) === (q.to === undefined), {
    message: 'ต้องส่ง from และ to คู่กัน หรือไม่ส่งทั้งคู่ (ใช้เดือนปัจจุบัน)'
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    message: 'from ต้องไม่เกิน to'
  });
