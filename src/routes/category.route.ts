import { Hono } from 'hono';
import { ValidationError } from '../domain/errors';
import type { AuthEnv } from '../middleware/auth';
import { createCategory, listCategories } from '../services/category.service';
import { createCategorySchema, listCategoriesQuerySchema } from './schemas/category.schema';

export const categoryRoutes = new Hono<AuthEnv>();

categoryRoutes.get('/', async (c) => {
  const { includeArchived } = listCategoriesQuerySchema.parse(c.req.query());
  const categories = await listCategories(c.env.DB, c.get('userId'), { includeArchived: includeArchived === 'true' });
  return c.json({ categories });
});

categoryRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError('invalid_json', 'เนื้อหาคำขอต้องเป็น JSON');
  });
  const parsed = createCategorySchema.parse(body);
  const category = await createCategory(c.env.DB, c.get('userId'), {
    name: parsed.name,
    icon: parsed.icon ?? null,
    ...(parsed.sortOrder !== undefined ? { sortOrder: parsed.sortOrder } : {})
  });
  return c.json({ category }, 201);
});
