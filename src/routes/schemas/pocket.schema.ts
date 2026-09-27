import { z } from 'zod';

// kind เป็น enum ระบบ ไม่ใช่ free text (หลักการ §3 ของ design: ค่าที่ผู้ใช้ตั้งเอง
// ห้ามควบคุมตรรกะ) · ดีฟอลต์ holds_balance · ปฏิเสธ field ที่ไม่รู้จัก (§3.2)
export const createPocketSchema = z
  .object({
    name: z.string({ error: 'ต้องมีชื่อกระเป๋า' }).trim().min(1, 'ชื่อกระเป๋าห้ามว่าง'),
    kind: z.enum(['holds_balance', 'flow_through'], { error: "ชนิดกระเป๋าต้องเป็น 'holds_balance' หรือ 'flow_through'" }).default('holds_balance'),
    parentId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    sortOrder: z.number().int().optional()
  })
  .strict();

// แก้ได้เฉพาะ name · sortOrder · categoryId · ปฏิเสธ field ที่ไม่รู้จัก (กัน kind/parentId/
// lastReconciledAt หลุดเข้ามา) · name trim แล้วต้องไม่ว่างและไม่เกิน 60 · categoryId ล้างได้ (null)
export const patchPocketSchema = z
  .object({
    name: z.string().trim().min(1, 'ชื่อกระเป๋าห้ามว่าง').max(60, 'ชื่อกระเป๋ายาวเกินไป (ไม่เกิน 60 ตัวอักษร)').optional(),
    sortOrder: z.number().int().optional(),
    categoryId: z.string().min(1).nullable().optional()
  })
  .strict();

export const listPocketsQuerySchema = z.object({
  includeArchived: z.enum(['true', 'false']).optional()
});
