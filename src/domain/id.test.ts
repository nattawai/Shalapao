import { afterEach, describe, expect, test, vi } from 'vitest';
import { idCreatedAt, newId, nowIso, today } from './id';

afterEach(() => {
  // §4.2 ห้ามปล่อย timer ค้าง — คืน clock จริงหลังทุก test ที่ fake
  vi.useRealTimers();
});

describe('newId', () => {
  test('เป็น ULID ยาว 26 ตัว', () => {
    expect(newId()).toHaveLength(26);
  });

  // ULID = Crockford base32: 0-9 และ A-Z ยกเว้น I L O U
  test('ใช้อักขระ Crockford base32 เท่านั้น', () => {
    expect(newId()).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{26}$/);
  });

  test('ไม่ซ้ำกัน', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect(new Set(ids).size).toBe(ids.length);
  });

  // 🔴 เหตุผลทั้งหมดที่ใช้ monotonicFactory แทน ulid() เปล่า:
  // สร้างรัว ๆ ในมิลลิวินาทีเดียวกันต้องเรียงจากน้อยไปมากเสมอ
  // ถ้าไม่มี test ข้อนี้ วันหนึ่งมีคนเปลี่ยนกลับไป ulid() เปล่าแล้วไม่มีอะไรเตือน
  test('สร้างติดกันเรียงจากน้อยไปมากเสมอ', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    // พิสูจน์ว่าแตะเคสจริง: ต้องมีหลาย id ที่ใช้ timestamp เดียวกัน (10 ตัวแรกซ้ำ)
    // ถ้าเครื่อง/CI ช้าจน newId() ตกคนละ ms หมด ลำดับจะเรียงเองอยู่แล้วโดยไม่ได้
    // ทดสอบการ clamp ของ monotonic — บรรทัดนี้จะแดงเพื่อเตือนว่าไม่ได้แตะเคส
    const prefixes = ids.map((id) => id.slice(0, 10));
    expect(new Set(prefixes).size).toBeLessThan(ids.length);
    expect(ids).toEqual([...ids].sort());
  });
});

describe('idCreatedAt', () => {
  // ใช้กรอบเวลาจริง (before/after) ไม่ตรึงเวลา เพราะ monotonicFactory clamp เป็น
  // timestamp ล่าสุดเมื่อ clock ถอยหลัง การ fake เวลาย้อนหลังจึงไม่น่าเชื่อถือ
  test('คืนเวลาที่อยู่ในช่วงตอนสร้าง id', () => {
    const before = Date.now();
    const ms = idCreatedAt(newId()).getTime();
    const after = Date.now();
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  test('โยน error เมื่อไม่ใช่ ULID', () => {
    expect(() => idCreatedAt('!!!!!!!!!!')).toThrow();
  });
});

describe('today', () => {
  // migrations/0005: CHECK (occurred_on LIKE '____-__-__') · today() ต้องผ่าน
  test('เป็นรูปแบบ YYYY-MM-DD ที่ผ่าน CHECK ของ migration', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // 🔴 บั๊ก timezone: ไทยคือ UTC+7 · ตี 3 ของไทย = 20:00Z ของเมื่อวาน
  // ถ้า today() ใช้ UTC จะคืนวันของเมื่อวาน — รายการที่บันทึกหลังเที่ยงคืนลงวันผิด
  test('ตี 3 ตามเวลาไทยต้องเป็นวันของไทย ไม่ใช่ของ UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T20:00:00.000Z')); // 03:00 น. 16 มี.ค. ไทย
    expect(today()).toBe('2026-03-16');
  });
});

describe('nowIso', () => {
  test('เป็น ISO-8601 ที่ parse กลับเป็นวันเวลาได้', () => {
    const iso = nowIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });
});
