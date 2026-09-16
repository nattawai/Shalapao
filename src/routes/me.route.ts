import type { Handler } from 'hono';
import type { AuthEnv } from '../middleware/auth';

// ชั่วคราว: smoke test สำหรับ first deploy — พิสูจน์ว่า ID token จริงวิ่งผ่าน auth ครบสาย
// คืนตัวตนจาก context ที่ auth middleware ยัดไว้เท่านั้น ไม่แตะ repository
export const me: Handler<AuthEnv> = (c) => c.json({ userId: c.get('userId'), displayName: c.get('displayName') });
