import { deleteAccount as repoDeleteAccount } from '../repositories/app-user.repository';

// ⚠️ forwarder โดยตั้งใจ — กฎการลบ (ลำดับ FK · solo/shared · เงื่อนไข NOT EXISTS) อยู่ที่ repository
// มีชั้นนี้เพื่อรักษากำแพง routes → services → repositories (route แตะ repository ตรง ๆ ไม่ได้)
export function deleteAccount(db: D1Database, userId: string): Promise<void> {
  return repoDeleteAccount(db, userId);
}
