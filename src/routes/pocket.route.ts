import { Hono } from 'hono';
import { ValidationError } from '../domain/errors';
import type { AuthEnv } from '../middleware/auth';
import { listEntries } from '../services/entry.service';
import { createPocket, listPockets } from '../services/pocket.service';
import { createPocketSchema, listPocketsQuerySchema } from './schemas/pocket.schema';

// userId มาจาก context ที่ auth middleware ยัดไว้ (token ที่ LINE เซ็น) — ไม่รับจาก client
// balance ส่งเป็นสตางค์จำนวนเต็มตรง ๆ (มาจาก view) ไม่แปลงเป็นบาท — การแปลงเป็นงานแสดงผล
export const pocketRoutes = new Hono<AuthEnv>();

pocketRoutes.get('/', async (c) => {
  const { includeArchived } = listPocketsQuerySchema.parse(c.req.query());
  const pockets = await listPockets(c.env.DB, c.get('userId'), { includeArchived: includeArchived === 'true' });
  return c.json({ pockets });
});

// กระเป๋าที่ไม่ใช่ของผู้ใช้ → คืน array ว่าง ไม่ใช่ 404 · 404 จะบอกได้ว่ากระเป๋า
// มีอยู่จริงไหม = รั่วข้อมูล (เหตุผลเดียวกับ 401 auth ที่ไม่บอกว่าพลาดข้อไหน)
// listEntries กรองผ่าน pocket_member อยู่แล้ว จึงได้ [] เองถ้าไม่ใช่สมาชิก
pocketRoutes.get('/:id/entries', async (c) => {
  const entries = await listEntries(c.env.DB, c.get('userId'), c.req.param('id'));
  return c.json({ entries });
});

pocketRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError('invalid_json', 'เนื้อหาคำขอต้องเป็น JSON');
  });
  const parsed = createPocketSchema.parse(body);
  // absent (undefined) → null ที่ขอบ · sortOrder ปล่อยให้ repo ใส่ค่าเริ่มต้นเอง
  const pocket = await createPocket(c.env.DB, c.get('userId'), {
    name: parsed.name,
    kind: parsed.kind,
    parentId: parsed.parentId ?? null,
    categoryId: parsed.categoryId ?? null,
    ...(parsed.sortOrder !== undefined ? { sortOrder: parsed.sortOrder } : {})
  });
  return c.json({ pocket }, 201);
});
