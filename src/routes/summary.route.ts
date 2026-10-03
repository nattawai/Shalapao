import { Hono } from 'hono';
import { currentMonthRange } from '../domain/date';
import type { AuthEnv } from '../middleware/auth';
import { summarizeByCategory } from '../services/entry.service';
import { getSummary } from '../services/pocket.service';
import { summaryByCategoryQuerySchema } from './schemas/summary.schema';

// ยอดรวม + จำนวนกระเป๋าของผู้ใช้ สำหรับหน้าแรก — อ่านอย่างเดียว
// userId มาจาก auth middleware (token ที่ LINE เซ็น) · ยอดเป็นสตางค์จำนวนเต็ม (frontend จัดรูปแบบเอง)
export const summaryRoutes = new Hono<AuthEnv>();

summaryRoutes.get('/', async (c) => {
  const summary = await getSummary(c.env.DB, c.get('userId'));
  return c.json(summary);
});

// สรุปเงินเข้า/ออกรายหมวดในช่วง · ไม่ส่ง from/to = เดือนปัจจุบันตามเวลาไทย (currentMonthRange)
// echo from/to กลับไปด้วย เพื่อให้หน้าจอรู้ว่ากำลังดูช่วงไหน (โดยเฉพาะตอนใช้ค่าเริ่มต้น)
summaryRoutes.get('/by-category', async (c) => {
  const q = summaryByCategoryQuerySchema.parse(c.req.query());
  const { from, to } = q.from !== undefined && q.to !== undefined ? { from: q.from, to: q.to } : currentMonthRange();
  const summary = await summarizeByCategory(c.env.DB, c.get('userId'), from, to);
  return c.json({ from, to, ...summary });
});
