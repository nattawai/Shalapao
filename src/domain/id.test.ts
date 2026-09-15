import { describe, expect, test } from 'vitest';
import { idCreatedAt, newId, nowIso, today } from './id';

describe('newId', () => {
  test('เป็น ULID ยาว 26 ตัว', () => {
    expect(newId()).toHaveLength(26);
  });

  test('ไม่ซ้ำกัน', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect(new Set(ids).size).toBe(ids.length);
  });

  // หัวใจของ monotonicFactory: insert รัวในมิลลิวินาทีเดียวกันแล้ว ORDER BY id
  // ต้องได้ลำดับเดียวกับที่สร้าง — ไม่งั้นลำดับรายการเพี้ยนตอนแบ่งเงินเดือน
  test('สร้างติดกันเรียงตามลำดับเสมอ (monotonic)', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect(ids).toEqual([...ids].sort());
  });
});

describe('idCreatedAt', () => {
  test('ถอดเวลาที่สร้างกลับมาได้ตรงกับตอนสร้าง', () => {
    const before = Date.now();
    const id = newId();
    const after = Date.now();
    const ms = idCreatedAt(id).getTime();
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  test('โยน error เมื่อไม่ใช่ ULID', () => {
    expect(() => idCreatedAt('!!!!!!!!!!')).toThrow();
  });
});

describe('today', () => {
  test('รูปแบบ YYYY-MM-DD ตรงกับที่ schema บังคับ', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('nowIso', () => {
  test('เป็น ISO-8601 ที่ parse กลับเป็นวันเวลาได้', () => {
    const iso = nowIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });
});
