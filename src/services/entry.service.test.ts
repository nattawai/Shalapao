import { describe, expect, test, vi } from 'vitest';
import * as entryRepo from '../repositories/entry.repository';
import { createEntry, createTransfer, listEntries } from './entry.service';

// entry.service เป็น forwarder — invariant ทั้งหมด (append-only · งวดกระทบยอด · amount>0
// · from≠to · สิทธิ์) อยู่ที่ repository และโยนเป็น typed error แล้ว · route แปลงเป็น HTTP
// ชั้นนี้แค่เป็นทางเข้าที่ถูกกฎ (routes แตะ repository ตรง ๆ ไม่ได้) — ไม่มีกฎเพิ่ม
vi.mock('../repositories/entry.repository', () => ({
  createEntry: vi.fn(),
  createTransfer: vi.fn(),
  listEntries: vi.fn()
}));

const db = {} as D1Database;

describe('entry.service (forwarder)', () => {
  test('createEntry ส่ง input ต่อ · คืนผลตรง ๆ', async () => {
    const made = { id: 'e1' };
    vi.mocked(entryRepo.createEntry).mockResolvedValue(made as never);
    const input = { pocketId: 'p1', amountSatang: -6100, note: 'กาแฟ' };
    const out = await createEntry(db, 'u1', input);
    expect(entryRepo.createEntry).toHaveBeenCalledWith(db, 'u1', input);
    expect(out).toBe(made);
  });

  test('createTransfer ส่ง input ต่อ · คืน { outflow, inflow }', async () => {
    const made = { outflow: { id: 'o' }, inflow: { id: 'i' } };
    vi.mocked(entryRepo.createTransfer).mockResolvedValue(made as never);
    const input = { fromPocketId: 'a', toPocketId: 'b', amountSatang: 50000 };
    const out = await createTransfer(db, 'u1', input);
    expect(entryRepo.createTransfer).toHaveBeenCalledWith(db, 'u1', input);
    expect(out).toBe(made);
  });

  test('listEntries ส่ง pocketId ต่อ', async () => {
    vi.mocked(entryRepo.listEntries).mockResolvedValue([{ id: 'e1' } as never]);
    const out = await listEntries(db, 'u1', 'p1');
    expect(entryRepo.listEntries).toHaveBeenCalledWith(db, 'u1', 'p1');
    expect(out).toEqual([{ id: 'e1' }]);
  });

  test('ไม่กลืน error ที่ repository โยน — ปล่อยผ่านให้ route แปลง', async () => {
    const err = new Error('boom');
    vi.mocked(entryRepo.createEntry).mockRejectedValue(err);
    await expect(createEntry(db, 'u1', { pocketId: 'p1', amountSatang: 1 })).rejects.toBe(err);
  });
});
