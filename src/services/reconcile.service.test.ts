import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError } from '../domain/errors';
import * as pocketRepo from '../repositories/pocket.repository';
import { previewReconcile, reconcile } from './reconcile.service';

vi.mock('../repositories/pocket.repository', () => ({
  getPocket: vi.fn(),
  getRollupBalanceAsOf: vi.fn(),
  applyReconcile: vi.fn()
}));

// today() ฉีดผ่าน mock — กฎ "ห้ามวันนี้/อนาคต" ต้องทดสอบได้โดยไม่ผูกกับวันจริง
vi.mock('../domain/id', () => ({ today: vi.fn(() => '2026-03-20') }));

const db = {} as D1Database;

function pocket(lastReconciledAt: string | null): pocketRepo.PocketWithBalance {
  return { id: 'p1', lastReconciledAt } as pocketRepo.PocketWithBalance;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pocketRepo.getPocket).mockResolvedValue(pocket(null));
});

describe('previewReconcile — อ่านอย่างเดียว ไม่เขียน', () => {
  test('คืนยอดที่ระบบคิด (expected) · actual/diff = null · ไม่แตะ applyReconcile', async () => {
    vi.mocked(pocketRepo.getRollupBalanceAsOf).mockResolvedValue(150000);

    const out = await previewReconcile(db, 'u1', 'p1', '2026-03-15');

    expect(out).toEqual({ asOfDate: '2026-03-15', expectedSatang: 150000, actualSatang: null, diffSatang: null });
    expect(pocketRepo.getRollupBalanceAsOf).toHaveBeenCalledWith(db, 'u1', 'p1', '2026-03-15');
    expect(pocketRepo.applyReconcile).not.toHaveBeenCalled();
  });
});

describe('reconcile — เทียบแล้วปิดงวด', () => {
  test('diff = actual − expected · สั่ง applyReconcile ด้วย diff ที่คิดได้ · คืนผลครบ', async () => {
    vi.mocked(pocketRepo.getRollupBalanceAsOf).mockResolvedValue(150000);
    const adjustment = { id: 'e-adj' } as never;
    vi.mocked(pocketRepo.applyReconcile).mockResolvedValue(adjustment);

    const out = await reconcile(db, 'u1', { pocketId: 'p1', asOfDate: '2026-03-15', actualBalanceSatang: 155000 });

    expect(pocketRepo.applyReconcile).toHaveBeenCalledWith(db, 'u1', {
      pocketId: 'p1',
      asOfDate: '2026-03-15',
      diffSatang: 5000
    });
    expect(out).toEqual({
      asOfDate: '2026-03-15',
      expectedSatang: 150000,
      actualSatang: 155000,
      diffSatang: 5000,
      adjustmentEntry: adjustment,
      lastReconciledAt: '2026-03-15'
    });
  });

  test('diff = 0 → applyReconcile คืน null → adjustmentEntry = null', async () => {
    vi.mocked(pocketRepo.getRollupBalanceAsOf).mockResolvedValue(150000);
    vi.mocked(pocketRepo.applyReconcile).mockResolvedValue(null);

    const out = await reconcile(db, 'u1', { pocketId: 'p1', asOfDate: '2026-03-15', actualBalanceSatang: 150000 });

    expect(out.diffSatang).toBe(0);
    expect(out.adjustmentEntry).toBeNull();
    expect(pocketRepo.applyReconcile).toHaveBeenCalledWith(db, 'u1', { pocketId: 'p1', asOfDate: '2026-03-15', diffSatang: 0 });
  });
});

describe('กฎวันที่ (SQL บังคับไม่ได้ — SQLite date() เป็น UTC)', () => {
  test('asOfDate = วันนี้ → ValidationError · ไม่คิดยอด ไม่เขียน', async () => {
    await expect(
      reconcile(db, 'u1', { pocketId: 'p1', asOfDate: '2026-03-20', actualBalanceSatang: 1 })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(pocketRepo.getRollupBalanceAsOf).not.toHaveBeenCalled();
    expect(pocketRepo.applyReconcile).not.toHaveBeenCalled();
  });

  test('asOfDate = อนาคต → ValidationError', async () => {
    await expect(
      reconcile(db, 'u1', { pocketId: 'p1', asOfDate: '2026-03-21', actualBalanceSatang: 1 })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test('asOfDate ก่อนเส้นที่ปิดไปแล้ว → ConflictError (เปิดงวดที่ปิดแล้วไม่ได้)', async () => {
    vi.mocked(pocketRepo.getPocket).mockResolvedValue(pocket('2026-03-10'));
    await expect(
      reconcile(db, 'u1', { pocketId: 'p1', asOfDate: '2026-03-09', actualBalanceSatang: 1 })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(pocketRepo.applyReconcile).not.toHaveBeenCalled();
  });

  // 🔴 เส้นทางกู้คืน: กระทบยอดวันเดิมซ้ำ (asOfDate == เส้นเดิม) ต้องทำได้ ไม่ใช่ 409
  // เกณฑ์คือ >= เส้น — กรอกยอดผิดแล้วต้องแก้วันเดิมได้
  test('asOfDate = เส้นเดิมพอดี → ผ่าน (แก้ยอดที่กรอกผิดวันเดิมได้)', async () => {
    vi.mocked(pocketRepo.getPocket).mockResolvedValue(pocket('2026-03-10'));
    vi.mocked(pocketRepo.getRollupBalanceAsOf).mockResolvedValue(100000);
    vi.mocked(pocketRepo.applyReconcile).mockResolvedValue({ id: 'e-adj' } as never);

    await reconcile(db, 'u1', { pocketId: 'p1', asOfDate: '2026-03-10', actualBalanceSatang: 100500 });

    expect(pocketRepo.applyReconcile).toHaveBeenCalledWith(db, 'u1', { pocketId: 'p1', asOfDate: '2026-03-10', diffSatang: 500 });
  });
});

describe('สิทธิ์ในกระเป๋า', () => {
  test('กระเป๋าไม่ใช่ของผู้ใช้ (getPocket → null) → ForbiddenError · ไม่เขียน', async () => {
    vi.mocked(pocketRepo.getPocket).mockResolvedValue(null);
    await expect(
      reconcile(db, 'u1', { pocketId: 'p1', asOfDate: '2026-03-15', actualBalanceSatang: 1 })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(pocketRepo.applyReconcile).not.toHaveBeenCalled();
  });

  test('preview ของกระเป๋าคนอื่น → ForbiddenError', async () => {
    vi.mocked(pocketRepo.getPocket).mockResolvedValue(null);
    await expect(previewReconcile(db, 'u1', 'p1', '2026-03-15')).rejects.toBeInstanceOf(ForbiddenError);
  });
});
