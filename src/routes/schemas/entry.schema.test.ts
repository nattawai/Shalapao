import { describe, expect, test } from 'vitest';
import { createEntrySchema, createTransferSchema } from './entry.schema';

// note ลง D1 ตรง ๆ — ถ้าไม่จำกัดความยาว ใครก็ยัดสตริงยาวเท่าไรก็ได้
describe('entry/transfer schema — จำกัดความยาว note', () => {
  test('note ยาวเกิน 500 → ปฏิเสธ (ทั้ง entry และ transfer)', () => {
    const long = 'x'.repeat(501);
    expect(() => createEntrySchema.parse({ pocketId: 'p', amountSatang: 100, note: long })).toThrow();
    expect(() => createTransferSchema.parse({ fromPocketId: 'a', toPocketId: 'b', amountSatang: 100, note: long })).toThrow();
  });

  test('note = 500 ตัวพอดี → ผ่าน', () => {
    expect(() => createEntrySchema.parse({ pocketId: 'p', amountSatang: 100, note: 'x'.repeat(500) })).not.toThrow();
  });
});
