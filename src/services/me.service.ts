import {
  deleteAccount as repoDeleteAccount,
  exportAccount as repoExportAccount,
  type AccountExport
} from '../repositories/app-user.repository';

// ⚠️ forwarder โดยตั้งใจ — กฎการลบ/อ่าน (ลำดับ FK · solo/shared · กรองผู้สร้าง) อยู่ที่ repository
// มีชั้นนี้เพื่อรักษากำแพง routes → services → repositories (route แตะ repository ตรง ๆ ไม่ได้)
export function deleteAccount(db: D1Database, userId: string): Promise<void> {
  return repoDeleteAccount(db, userId);
}

export function exportAccount(db: D1Database, userId: string): Promise<AccountExport> {
  return repoExportAccount(db, userId);
}
