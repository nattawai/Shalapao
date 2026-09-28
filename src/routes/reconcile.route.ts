import { Hono } from 'hono';
import { ValidationError } from '../domain/errors';
import type { AuthEnv } from '../middleware/auth';
import { getLastReconcile, previewReconcile, reconcile, unreconcile } from '../services/reconcile.service';
import { reconcileBodySchema, reconcilePreviewQuerySchema } from './schemas/reconcile.schema';

// ปุ่มเช็คยอด ซ้อนใต้ /api/pockets/:id — pocketId มาจาก URL ไม่ใช่ body
// userId มาจาก auth middleware (token ที่ LINE เซ็น) · ยอดเป็นสตางค์จำนวนเต็มตรง ๆ
export const reconcileRoutes = new Hono<AuthEnv>();

// อ่านอย่างเดียว: ให้ UI แสดง "ระบบคิดว่า X" ก่อนผู้ใช้กรอกยอดจริง — ไม่เขียนอะไรลง DB
reconcileRoutes.get('/:id/reconcile/preview', async (c) => {
  const { asOfDate } = reconcilePreviewQuerySchema.parse(c.req.query());
  const preview = await previewReconcile(c.env.DB, c.get('userId'), c.req.param('id'), asOfDate);
  return c.json(preview);
});

reconcileRoutes.post('/:id/reconcile', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError('invalid_json', 'เนื้อหาคำขอต้องเป็น JSON');
  });
  const parsed = reconcileBodySchema.parse(body);
  const result = await reconcile(c.env.DB, c.get('userId'), {
    pocketId: c.req.param('id'),
    asOfDate: parsed.asOfDate,
    actualBalanceSatang: parsed.actualBalanceSatang
  });
  return c.json(result);
});

// อ่านการตรวจยอดครั้งล่าสุด (แสดง "ตรวจยอดล่าสุด" บนหน้าแรก) · ไม่เคยตรวจ → { reconcile: null }
reconcileRoutes.get('/:id/reconcile', async (c) => {
  const record = await getLastReconcile(c.env.DB, c.get('userId'), c.req.param('id'));
  return c.json({ reconcile: record });
});

// ยกเลิกการตรวจยอดครั้งล่าสุด — 404 ถ้าไม่เคยตรวจ · 403 กระเป๋าคนอื่น · 409 กระเป๋าแม่ปิดคลุม
reconcileRoutes.delete('/:id/reconcile', async (c) => {
  const result = await unreconcile(c.env.DB, c.get('userId'), c.req.param('id'));
  return c.json(result);
});
