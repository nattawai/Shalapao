import { describe, expect, test, vi } from 'vitest';
import * as categoryRepo from '../repositories/category.repository';
import { createCategory, listCategories } from './category.service';

// category.service เป็น forwarder ล้วน — category เป็นของ user โดยตรง repository จึง
// ไม่มี cross-ownership ให้กัน และไม่มีกฎธุรกิจใน v0 · ชั้นนี้มีไว้รักษากำแพง
// routes → services → repositories ให้เด็ดขาด (route แตะ repo ตรง ๆ ไม่ได้)
vi.mock('../repositories/category.repository', () => ({
  listCategories: vi.fn(),
  createCategory: vi.fn()
}));

const db = {} as D1Database;

describe('category.service (forwarder)', () => {
  test('listCategories ส่ง userId + options ต่อให้ repository', async () => {
    vi.mocked(categoryRepo.listCategories).mockResolvedValue([{ id: 'c1' } as never]);
    const out = await listCategories(db, 'user-1', { includeArchived: true });
    expect(categoryRepo.listCategories).toHaveBeenCalledWith(db, 'user-1', { includeArchived: true });
    expect(out).toEqual([{ id: 'c1' }]);
  });

  test('createCategory ส่ง input ต่อ · คืนผลตรง ๆ', async () => {
    const created = { id: 'c2', name: 'อาหาร' };
    vi.mocked(categoryRepo.createCategory).mockResolvedValue(created as never);
    const out = await createCategory(db, 'user-1', { name: 'อาหาร' });
    expect(categoryRepo.createCategory).toHaveBeenCalledWith(db, 'user-1', { name: 'อาหาร' });
    expect(out).toBe(created);
  });
});
