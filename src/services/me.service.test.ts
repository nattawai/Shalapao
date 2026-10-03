import { describe, expect, test, vi } from 'vitest';
import * as userRepo from '../repositories/app-user.repository';
import { deleteAccount } from './me.service';

// me.service เป็น forwarder — กฎการลบอยู่ที่ repository · ชั้นนี้แค่ส่งต่อให้ route เข้าถึงได้
vi.mock('../repositories/app-user.repository', () => ({ deleteAccount: vi.fn() }));

const db = {} as D1Database;

describe('me.service (forwarder)', () => {
  test('deleteAccount ส่ง userId ต่อ', async () => {
    vi.mocked(userRepo.deleteAccount).mockResolvedValue(undefined);
    await deleteAccount(db, 'u1');
    expect(userRepo.deleteAccount).toHaveBeenCalledWith(db, 'u1');
  });

  test('ไม่กลืน error ที่ repository โยน', async () => {
    const err = new Error('boom');
    vi.mocked(userRepo.deleteAccount).mockRejectedValue(err);
    await expect(deleteAccount(db, 'u1')).rejects.toBe(err);
  });
});
