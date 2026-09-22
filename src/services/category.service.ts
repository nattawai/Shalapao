import {
  createCategory as repoCreateCategory,
  listCategories as repoListCategories,
  type Category,
  type CreateCategoryInput,
  type ListCategoriesOptions
} from '../repositories/category.repository';

// ⚠️ forwarder ล้วน — category เป็นของ user โดยตรง (ไม่ผ่าน pocket_member) จึงไม่มี
// cross-ownership ให้กัน และ v0 ไม่มีกฎธุรกิจของ category เลย · ชั้นนี้ไม่มีตรรกะ
// มีไว้เพื่อรักษากำแพง routes → services → repositories ให้เด็ดขาด ไม่เจาะ exception
// (comment ใน eslint.config บอกเอง: เปิดรูเดียว วันหนึ่งจะมีคนข้าม)

export function listCategories(
  db: D1Database,
  userId: string,
  options?: ListCategoriesOptions
): Promise<Category[]> {
  return repoListCategories(db, userId, options);
}

export function createCategory(db: D1Database, userId: string, input: CreateCategoryInput): Promise<Category> {
  return repoCreateCategory(db, userId, input);
}
