import { describe, expect, test } from 'vitest';
import { currentMonthRange } from './date';

// inject now ตรง ๆ (ไม่ต้อง fake timer) — currentMonthRange ส่ง now ต่อให้ today()
describe('currentMonthRange', () => {
  test('เดือน 31 วัน → from = วันที่ 1 · to = วันที่ 31', () => {
    expect(currentMonthRange(new Date('2026-10-03T05:00:00.000Z'))).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  test('เดือน 30 วัน → to = วันที่ 30', () => {
    expect(currentMonthRange(new Date('2026-04-15T05:00:00.000Z'))).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });

  // 🔴 กับดัก ก.พ.: ห้าม hardcode 30/31 — ปีปกติต้องได้ 28
  test('กุมภาพันธ์ปีปกติ → to = วันที่ 28', () => {
    expect(currentMonthRange(new Date('2026-02-10T05:00:00.000Z'))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  // 🔴 อธิกสุรทิน (2028 หาร 4 ลงตัว) → ก.พ. มี 29 วัน
  test('กุมภาพันธ์ปีอธิกสุรทิน → to = วันที่ 29', () => {
    expect(currentMonthRange(new Date('2028-02-10T05:00:00.000Z'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  test('ธันวาคม → from/to อยู่ปีเดียวกัน ไม่ข้ามปี', () => {
    expect(currentMonthRange(new Date('2026-12-20T05:00:00.000Z'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  // 🔴 ต้องใช้เวลาไทย ไม่ใช่ UTC: 31 ม.ค. 18:00Z = 1 ก.พ. 01:00 ไทย → ต้องเป็นเดือน ก.พ.
  // ถ้าเผลอคิดจาก UTC จะได้เดือน ม.ค. (ต้นเดือน/ปลายเดือนเพี้ยนทั้งก้อน)
  test('ข้ามเดือนตอนเที่ยงคืนเวลาไทย → ยึดเดือนของไทย', () => {
    expect(currentMonthRange(new Date('2026-01-31T18:00:00.000Z'))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});
