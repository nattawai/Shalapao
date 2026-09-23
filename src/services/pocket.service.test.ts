import { describe, expect, test, vi } from 'vitest';
import * as pocketRepo from '../repositories/pocket.repository';
import { createPocket, listPockets } from './pocket.service';

// pocket.service เป็น forwarder — งานจริง (สิทธิ์ · ownership · balance จาก view) อยู่ที่
// repository และการแปลง error เป็น HTTP อยู่ที่ route · test นี้ล็อกสัญญาว่า service
// ส่ง argument ต่อโดยไม่แตะ ไม่กลืน error ที่ repo โยน
vi.mock('../repositories/pocket.repository', () => ({
  listPockets: vi.fn(),
  createPocket: vi.fn()
}));

const db = {} as D1Database;

describe('pocket.service (forwarder)', () => {
  test('listPockets ส่ง userId + options ต่อให้ repository ตรง ๆ', async () => {
    vi.mocked(pocketRepo.listPockets).mockResolvedValue([{ id: 'p1' } as never]);
    const out = await listPockets(db, 'user-1', { includeArchived: true });
    expect(pocketRepo.listPockets).toHaveBeenCalledWith(db, 'user-1', { includeArchived: true });
    expect(out).toEqual([{ id: 'p1' }]);
  });

  test('createPocket ส่ง input ต่อ · คืนผลจาก repository ตรง ๆ', async () => {
    const created = { id: 'p2', name: 'เงินเก็บ' };
    vi.mocked(pocketRepo.createPocket).mockResolvedValue(created as never);
    const out = await createPocket(db, 'user-1', { name: 'เงินเก็บ', kind: 'holds_balance' });
    expect(pocketRepo.createPocket).toHaveBeenCalledWith(db, 'user-1', { name: 'เงินเก็บ', kind: 'holds_balance' });
    expect(out).toBe(created);
  });

  test('ไม่กลืน error ที่ repository โยน — ปล่อยผ่านให้ route แปลง', async () => {
    const err = new Error('boom');
    vi.mocked(pocketRepo.createPocket).mockRejectedValue(err);
    await expect(createPocket(db, 'user-1', { name: 'x', kind: 'holds_balance' })).rejects.toBe(err);
  });
});
