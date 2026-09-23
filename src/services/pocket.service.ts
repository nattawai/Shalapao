import {
  createPocket as repoCreatePocket,
  listPockets as repoListPockets,
  type CreatePocketInput,
  type ListPocketsOptions,
  type PocketWithBalance
} from '../repositories/pocket.repository';

// ⚠️ forwarder โดยตั้งใจ — v0 ไม่มีกฎธุรกิจของ pocket ที่ repository ไม่ได้ถือ
// (สิทธิ์ · ownership ของ parent/category · balance จาก view = repository ทำครบ)
// kind ถูก validate ที่ zod (route) · error ถูกแปลงเป็น HTTP ที่ route
// ชั้นนี้มีไว้ให้ route มีทางเข้าถึงข้อมูลที่ถูกกฎ (routes แตะ repositories ตรง ๆ ไม่ได้)
// ถ้าวันหนึ่งมีกฎจริง (เช่น reconcile, allocation) มันจะมาอยู่ที่นี่

export function listPockets(
  db: D1Database,
  userId: string,
  options?: ListPocketsOptions
): Promise<PocketWithBalance[]> {
  return repoListPockets(db, userId, options);
}

export function createPocket(db: D1Database, userId: string, input: CreatePocketInput): Promise<PocketWithBalance> {
  return repoCreatePocket(db, userId, input);
}
