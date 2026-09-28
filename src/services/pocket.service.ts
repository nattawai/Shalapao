import {
  archivePocket as repoArchivePocket,
  createPocket as repoCreatePocket,
  getSummary as repoGetSummary,
  listPockets as repoListPockets,
  unarchivePocket as repoUnarchivePocket,
  updatePocket as repoUpdatePocket,
  type CreatePocketInput,
  type ListPocketsOptions,
  type PocketWithBalance,
  type Summary,
  type UpdatePocketInput
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

export function getSummary(db: D1Database, userId: string): Promise<Summary> {
  return repoGetSummary(db, userId);
}

export function updatePocket(
  db: D1Database,
  userId: string,
  pocketId: string,
  patch: UpdatePocketInput
): Promise<PocketWithBalance> {
  return repoUpdatePocket(db, userId, pocketId, patch);
}

export function archivePocket(db: D1Database, userId: string, pocketId: string): Promise<PocketWithBalance> {
  return repoArchivePocket(db, userId, pocketId);
}

export function unarchivePocket(db: D1Database, userId: string, pocketId: string): Promise<PocketWithBalance> {
  return repoUnarchivePocket(db, userId, pocketId);
}
