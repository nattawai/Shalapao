import { describe, expect, test } from 'vitest';
import { bahtToSatang, satangToBaht, splitProrata, splitEqual } from './money';

describe('bahtToSatang', () => {
  test('แปลงบาททศนิยมเป็นสตางค์', () => {
    expect(bahtToSatang(758.63)).toBe(75863);
    expect(bahtToSatang(666.67)).toBe(66667);
  });

  test('รับ string ที่มีลูกน้ำได้', () => {
    expect(bahtToSatang('27,766.67')).toBe(2776667);
  });

  test('ปัดเศษทศนิยมตำแหน่งที่สามทิ้ง', () => {
    expect(bahtToSatang(0.005)).toBe(1);
    expect(bahtToSatang(0.004)).toBe(0);
  });

  test('โยน error เมื่อไม่ใช่ตัวเลข', () => {
    expect(() => bahtToSatang('abc')).toThrow();
    expect(() => bahtToSatang('')).toThrow();
  });

  test('ไม่เพี้ยนจาก floating point', () => {
    // 0.1 + 0.2 = 0.30000000000000004 ในโลก float
    // ถ้าเก็บเป็นสตางค์ ปัญหานี้หายไป
    expect(bahtToSatang(0.1) + bahtToSatang(0.2)).toBe(bahtToSatang(0.3));
  });
});

describe('satangToBaht', () => {
  test('แสดงทศนิยมสองตำแหน่งเสมอ', () => {
    expect(satangToBaht(100000)).toBe('1,000.00');
    expect(satangToBaht(7)).toBe('0.07');
    expect(satangToBaht(0)).toBe('0.00');
  });
});

describe('splitProrata', () => {
  test('แบ่งตามสัดส่วนเมื่อหารลงตัว', () => {
    // Lineman: A 300 · B 250 · C 250 · D 200 · ส่วนลด 200
    const parts = splitProrata(20000, [30000, 25000, 25000, 20000]);
    expect(parts).toEqual([6000, 5000, 5000, 4000]);
  });

  test('🔴 ผลรวมต้องเท่ากับยอดเต็มเสมอ แม้หารไม่ลงตัว', () => {
    const parts = splitProrata(20000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(20000);
  });

  test('เศษตกที่เจ้าภาพตามที่ระบุ', () => {
    const parts = splitProrata(20000, [1, 1, 1], 2);
    expect(parts[2]).toBeGreaterThan(parts[0]!);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(20000);
  });

  test('ผลรวมตรงเสมอในทุกกรณีที่สุ่มมา', () => {
    for (let total = 1; total <= 500; total += 7) {
      for (let n = 2; n <= 7; n++) {
        const parts = splitProrata(total, new Array<number>(n).fill(1));
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  test('ยอดติดลบก็ยังบาลานซ์ — ใช้กับรายการเงินออก', () => {
    const parts = splitProrata(-20000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-20000);
  });

  test('โยน error เมื่อน้ำหนักรวมเป็นศูนย์', () => {
    expect(() => splitProrata(100, [0, 0])).toThrow();
  });

  test('โยน error เมื่อไม่มีส่วนแบ่งเลย', () => {
    expect(() => splitProrata(100, [])).toThrow();
  });

  test('โยน error เมื่อ remainderTo อยู่นอกช่วง', () => {
    expect(() => splitProrata(100, [1, 1], 5)).toThrow();
  });
});

describe('splitEqual', () => {
  test('แบ่งเท่ากันและผลรวมตรง', () => {
    const parts = splitEqual(10000, 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
  });
});
