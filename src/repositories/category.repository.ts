import { newId, nowIso } from '../domain/id';

export type Category = {
  id: string;
  userId: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
};

export type CreateCategoryInput = {
  name: string;
  icon?: string | null;
  sortOrder?: number;
};

export type ListCategoriesOptions = {
  includeArchived?: boolean;
};

type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
};

// category เป็นของ user โดยตรง (ไม่ผ่าน pocket_member) — filter ด้วย user_id เสมอ
const SELECT_USER_CATEGORY = `
  SELECT id, user_id, name, icon, sort_order, archived_at, created_at
  FROM category
  WHERE user_id = ?
`;

function mapRow(row: CategoryRow): Category {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    icon: row.icon,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    createdAt: row.created_at
  };
}

export async function getCategory(db: D1Database, userId: string, categoryId: string): Promise<Category | null> {
  const row = await db
    .prepare(`${SELECT_USER_CATEGORY} AND id = ?`)
    .bind(userId, categoryId)
    .first<CategoryRow>();
  return row ? mapRow(row) : null;
}

export async function listCategories(
  db: D1Database,
  userId: string,
  options: ListCategoriesOptions = {}
): Promise<Category[]> {
  const archivedFilter = options.includeArchived ? '' : ' AND archived_at IS NULL';
  const { results } = await db
    .prepare(`${SELECT_USER_CATEGORY}${archivedFilter} ORDER BY sort_order, id`)
    .bind(userId)
    .all<CategoryRow>();
  return results.map(mapRow);
}

export async function createCategory(
  db: D1Database,
  userId: string,
  input: CreateCategoryInput
): Promise<Category> {
  const id = newId();
  await db
    .prepare('INSERT INTO category (id, user_id, name, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, userId, input.name, input.icon ?? null, input.sortOrder ?? 0, nowIso())
    .run();

  const created = await getCategory(db, userId, id);
  if (!created) throw new Error('สร้างหมวดแล้วอ่านกลับไม่เจอ — ไม่ควรเกิด');
  return created;
}
