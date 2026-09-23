import {
  createEntry as repoCreateEntry,
  createTransfer as repoCreateTransfer,
  listEntries as repoListEntries,
  type CreateEntryInput,
  type CreateTransferInput,
  type Entry
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
