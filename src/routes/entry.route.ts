import { Hono } from 'hono';
import { ValidationError } from '../domain/errors';
import type { AuthEnv } from '../middleware/auth';
import { createEntry, createTransfer } from '../services/entry.service';
import { createEntrySchema, createTransferSchema } from './schemas/entry.schema';

// occurredOn ที่ไม่ส่งมา ปล่อย undefined ลงไปถึง repository — repository ใส่ today()
// (Asia/Bangkok) ให้เอง ห้ามคำนวณวันที่ซ้ำที่นี่ · conditional spread เพราะ
// exactOptionalPropertyTypes (เหมือน sortOrder ใน pocket.route)
export const entryRoutes = new Hono<AuthEnv>();

entryRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError('invalid_json', 'เนื้อหาคำขอต้องเป็น JSON');
  });
  const parsed = createEntrySchema.parse(body);
  const entry = await createEntry(c.env.DB, c.get('userId'), {
    pocketId: parsed.pocketId,
    amountSatang: parsed.amountSatang,
    ...(parsed.occurredOn !== undefined ? { occurredOn: parsed.occurredOn } : {}),
    ...(parsed.categoryId !== undefined ? { categoryId: parsed.categoryId } : {}),
    ...(parsed.note !== undefined ? { note: parsed.note } : {})
  });
  return c.json({ entry }, 201);
});

export const transferRoutes = new Hono<AuthEnv>();

transferRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError('invalid_json', 'เนื้อหาคำขอต้องเป็น JSON');
  });
  const parsed = createTransferSchema.parse(body);
  const { outflow, inflow } = await createTransfer(c.env.DB, c.get('userId'), {
    fromPocketId: parsed.fromPocketId,
    toPocketId: parsed.toPocketId,
    amountSatang: parsed.amountSatang,
    ...(parsed.occurredOn !== undefined ? { occurredOn: parsed.occurredOn } : {}),
    ...(parsed.note !== undefined ? { note: parsed.note } : {})
  });
  return c.json({ outflow, inflow }, 201);
});
