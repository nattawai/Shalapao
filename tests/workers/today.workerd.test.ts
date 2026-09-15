import { describe, expect, test } from 'vitest';
import { today } from '../../src/domain/id';

// today() รันจริงใน workerd ตอน entry.service สร้างรายการ · unit test บน node
// พิสูจน์ไม่ได้ว่า workerd ใช้ timezone data จริง
describe('today() บน workerd', () => {
  // เทียบสอง timezone ณ เวลาเดียวกัน — ถ้า workerd ไม่มี tz data แล้ว fallback
  // เป็น UTC เงียบ ๆ ทั้งสองจะได้ค่าเท่ากัน → assertion Bangkok แดง = จับได้
  // (แค่เช็ค YYYY-MM-DD ไม่พอ เพราะ fallback UTC ก็ยังได้รูปแบบถูก)
  test('ใช้ timezone จริง ไม่ fallback UTC เงียบ ๆ', () => {
    const at = new Date('2026-03-15T20:00:00.000Z'); // 03:00 16 มี.ค. ไทย · ยัง 15 มี.ค. UTC
    expect(today('Asia/Bangkok', at)).toBe('2026-03-16');
    expect(today('UTC', at)).toBe('2026-03-15');
  });
});
