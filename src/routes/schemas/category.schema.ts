import { z } from 'zod';

export const createCategorySchema = z
  .object({
    name: z.string({ error: 'ต้องมีชื่อหมวด' }).trim().min(1, 'ชื่อหมวดห้ามว่าง'),
    icon: z.string().min(1).optional(),
    sortOrder: z.number().int().optional()
  })
  .strict();

export const listCategoriesQuerySchema = z.object({
  includeArchived: z.enum(['true', 'false']).optional()
});
