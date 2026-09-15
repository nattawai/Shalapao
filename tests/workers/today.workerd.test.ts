import { describe, expect, test } from 'vitest';
import { today } from '../../src/domain/id';

// today() รันจริงใน workerd ตอน entry.service สร้างรายการ — unit test บน node
// พิสูจน์ไม่ได้ว่า workerd รองรับ Intl timezone (node มี full ICU อยู่แล้ว)
// test นี้จึงเรียก today() ในรันไทม์จริง เพื่อยืนยันว่า workerd แปลง timezone ได้
describe('today() บน workerd', () => {
  test('คืน YYYY-MM-DD และไม่ throw', () => {
    expect(() => today('Asia/Bangkok')).not.toThrow();
    expect(today('Asia/Bangkok')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
