import { describe, expect, test, vi } from 'vitest';
import * as userRepo from '../repositories/app-user.repository';
import { deleteAccount, exportAccount } from './me.service';

// me.service เป็น forwarder — กฎการลบ/อ่านอยู่ที่ repository · ชั้นนี้แค่ส่งต่อให้ route เข้าถึงได้
vi.mock('../repositories/app-user.repository', () => ({ deleteAccount: vi.fn(), exportAccount: vi.fn() }));

const db = {} as D1Database;

describe('me.service (forwarder)', () => {
  test('deleteAccount ส่ง userId ต่อ', async () => {
    vi.mocked(userRepo.deleteAccount).mockResolvedValue(undefined);
    await deleteAccount(db, 'u1');
    expect(userRepo.deleteAccount).toHaveBeenCalledWith(db, 'u1');
  });

  test('exportAccount ส่ง userId ต่อ · คืนผลตรง ๆ', async () => {
    const made = { exportedAt: 'x', amountUnit: 'satang' as const, user: null, categories: [], pockets: [], memberships: [], entries: [], reconciles: [] };
    vi.mocked(userRepo.exportAccount).mockResolvedValue(made);
    const out = await exportAccount(db, 'u1');
    expect(userRepo.exportAccount).toHaveBeenCalledWith(db, 'u1');
    expect(out).toBe(made);
  });

  test('ไม่กลืน error ที่ repository โยน', async () => {
    const err = new Error('boom');
    vi.mocked(userRepo.deleteAccount).mockRejectedValue(err);
    await expect(deleteAccount(db, 'u1')).rejects.toBe(err);
  });
});
