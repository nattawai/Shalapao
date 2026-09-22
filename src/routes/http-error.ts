import type { Context } from 'hono';
import { ZodError } from 'zod';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors';

// จุดเดียวที่แปลง "ชนิดของ failure" → HTTP status · repository/service ไม่ต้องรู้จักเลข
// ต่างจาก 401 ของ auth (middleware ตอบเอง ไม่บอกเหตุผล เพราะอาจเป็นผู้โจมตี) —
// ตรงนี้คือเจ้าของข้อมูลเอง จึงบอก message ที่นำไปสู่ทางออกได้
export function httpError(err: Error, c: Context): Response {
  if (err instanceof ZodError) {
    return c.json({ error: 'validation_error', message: err.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }, 400);
  }
  if (err instanceof ValidationError) return c.json({ error: err.code, message: err.message }, 400);
  if (err instanceof ForbiddenError) return c.json({ error: err.code, message: err.message }, 403);
  if (err instanceof NotFoundError) return c.json({ error: err.code, message: err.message }, 404);
  if (err instanceof ConflictError) return c.json({ error: err.code, message: err.message }, 409);
  return c.json({ error: 'internal', message: 'เกิดข้อผิดพลาดภายใน ลองใหม่อีกครั้ง' }, 500);
}
