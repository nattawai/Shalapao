import {
  createEntry as repoCreateEntry,
  createTransfer as repoCreateTransfer,
  deleteEntry as repoDeleteEntry,
  listEntries as repoListEntries,
  listSubtreeEntries as repoListSubtreeEntries,
  replaceEntry as repoReplaceEntry,
  summarizeByCategory as repoSummarizeByCategory,
  updateEntryLabels as repoUpdateEntryLabels,
  type CategorySummary,
  type CreateEntryInput,
  type CreateTransferInput,
  type Entry,
  type EntryWithPocket,
  type ReplaceEntryInput,
  type UpdateEntryLabelsInput
} from '../repositories/entry.repository';

// ⚠️ forwarder โดยตั้งใจ — invariant ทั้งหมด (append-only · งวดกระทบยอด · amount>0 ·
// from≠to · สิทธิ์ผ่าน pocket_member · occurredOn default today()) อยู่ที่ repository
// และโยนเป็น typed error แล้ว · route แปลงเป็น HTTP · v0 ไม่มีกฎ entry ที่ repo ไม่ได้ถือ
// มีชั้นนี้เพื่อรักษากำแพง routes → services → repositories ให้เด็ดขาด

export function createEntry(db: D1Database, userId: string, input: CreateEntryInput): Promise<Entry> {
  return repoCreateEntry(db, userId, input);
}

export function createTransfer(
  db: D1Database,
  userId: string,
  input: CreateTransferInput
): Promise<{ outflow: Entry; inflow: Entry }> {
  return repoCreateTransfer(db, userId, input);
}

export function listEntries(db: D1Database, userId: string, pocketId: string): Promise<Entry[]> {
  return repoListEntries(db, userId, pocketId);
}

export function listSubtreeEntries(db: D1Database, userId: string, pocketId: string): Promise<EntryWithPocket[]> {
  return repoListSubtreeEntries(db, userId, pocketId);
}

export function summarizeByCategory(db: D1Database, userId: string, from: string, to: string): Promise<CategorySummary> {
  return repoSummarizeByCategory(db, userId, from, to);
}

export function deleteEntry(db: D1Database, userId: string, entryId: string): Promise<void> {
  return repoDeleteEntry(db, userId, entryId);
}

export function updateEntryLabels(
  db: D1Database,
  userId: string,
  entryId: string,
  patch: UpdateEntryLabelsInput
): Promise<Entry> {
  return repoUpdateEntryLabels(db, userId, entryId, patch);
}

export function replaceEntry(
  db: D1Database,
  userId: string,
  entryId: string,
  input: ReplaceEntryInput
): Promise<Entry> {
  return repoReplaceEntry(db, userId, entryId, input);
}
