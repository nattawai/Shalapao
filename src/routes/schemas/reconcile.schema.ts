import { z } from 'zod';
import { isRealYmd } from './shared';

const asOfDate = z.string().refine(isRealYmd, 'วันที่ต้องเป็น YYYY-MM-DD ที่มีอยู่จริง');

// preview อ่านอย่างเดียว — asOfDate มาทาง query string
export const reconcilePreviewQuerySchema = z.object({ asOfDate });

// actualBalanceSatang เป็นยอดจริงจากธนาคาร — ต่างจากยอดรายการ (entry) ตรงที่ 0 และติดลบ
// เป็นค่าที่ถูกต้องได้ (กระเป๋าว่าง / เบิกเกิน) จึงเช็คแค่ "จำนวนเต็ม" ไม่เช็ค ≠ 0
export const reconcileBodySchema = z
  .object({
    actualBalanceSatang: z
      .number({ error: 'ต้องมียอดจริง (หน่วยสตางค์)' })
      .int('ยอดจริงต้องเป็นสตางค์จำนวนเต็ม ไม่มีทศนิยม'),
    asOfDate
  })
  .strict();
