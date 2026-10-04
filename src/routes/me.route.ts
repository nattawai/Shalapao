import type { Handler } from 'hono';
import type { AuthEnv } from '../middleware/auth';
import { deleteAccount } from '../services/me.service';

// ชั่วคราว: smoke test สำหรับ first deploy — พิสูจน์ว่า ID token จริงวิ่งผ่าน auth ครบสาย
// คืนตัวตนจาก context ที่ auth middleware ยัดไว้เท่านั้น ไม่แตะ repository
export const me: Handler<AuthEnv> = (c) => c.json({ userId: c.get('userId'), displayName: c.get('displayName') });

// ลบบัญชีถาวร (PDPA) — userId จาก auth เท่านั้น ไม่มี body · สำเร็จ → 204
// เรียกซ้ำหลังลบ: auth upsert สร้างบัญชีว่างใหม่ก่อนถึงที่นี่ แล้วลบของว่าง → 204 เหมือนเดิม (ไม่ใช่บั๊ก)
export const deleteMe: Handler<AuthEnv> = async (c) => {
  await deleteAccount(c.env.DB, c.get('userId'));
  return c.body(null, 204);
};
