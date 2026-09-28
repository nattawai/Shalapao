import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';
import { getSummary } from '../services/pocket.service';

// ยอดรวม + จำนวนกระเป๋าของผู้ใช้ สำหรับหน้าแรก — อ่านอย่างเดียว
// userId มาจาก auth middleware (token ที่ LINE เซ็น) · ยอดเป็นสตางค์จำนวนเต็ม (frontend จัดรูปแบบเอง)
export const summaryRoutes = new Hono<AuthEnv>();

summaryRoutes.get('/', async (c) => {
  const summary = await getSummary(c.env.DB, c.get('userId'));
  return c.json(summary);
});
