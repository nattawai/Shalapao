import { describe, expect, test } from 'vitest';
import { reconcileBodySchema, reconcilePreviewQuerySchema } from './reconcile.schema';

describe('reconcile body schema', () => {
  // ยอดจริงเป็น 0 หรือติดลบได้ (กระเป๋าว่าง/เบิกเกิน) — ต่างจากยอดรายการที่ห้าม 0
  test('actualBalanceSatang = 0 และติดลบ → ผ่าน', () => {
    expect(() => reconcileBodySchema.parse({ actualBalanceSatang: 0, asOfDate: '2026-03-15' })).not.toThrow();
    expect(() => reconcileBodySchema.parse({ actualBalanceSatang: -5000, asOfDate: '2026-03-15' })).not.toThrow();
  });

  test('actualBalanceSatang ทศนิยม → ปฏิเสธ', () => {
    expect(() => reconcileBodySchema.parse({ actualBalanceSatang: 100.5, asOfDate: '2026-03-15' })).toThrow();
  });

  test("asOfDate ที่ไม่ใช่วันจริง ('2026-99-99') → ปฏิเสธ", () => {
    expect(() => reconcileBodySchema.parse({ actualBalanceSatang: 100, asOfDate: '2026-99-99' })).toThrow();
  });

  test('field แปลกปลอม (strict) → ปฏิเสธ', () => {
    expect(() => reconcileBodySchema.parse({ actualBalanceSatang: 100, asOfDate: '2026-03-15', evil: 1 })).toThrow();
  });
});

describe('reconcile preview query schema', () => {
  test('asOfDate วันจริง → ผ่าน · หายไป → ปฏิเสธ', () => {
    expect(reconcilePreviewQuerySchema.parse({ asOfDate: '2026-03-15' }).asOfDate).toBe('2026-03-15');
    expect(() => reconcilePreviewQuerySchema.parse({})).toThrow();
  });
});
