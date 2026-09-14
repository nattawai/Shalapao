import { monotonicFactory } from 'ulid';

/**
 * ทุก id ในระบบเป็น ULID
 *
 * ทำไมต้อง monotonicFactory ไม่ใช่ ulid() ตรง ๆ:
 * ULID เอาเวลาระดับมิลลิวินาทีไว้ 48 bit แรก ที่เหลือเป็นค่าสุ่ม
 * ถ้าสร้างหลายตัวในมิลลิวินาทีเดียวกัน ลำดับระหว่างกันจะสุ่ม
 *
 * ซึ่งจะเกิดแน่นอนตอน "แบ่งเงินเดือน" ที่ insert 10 แถวรวดเดียว
 * แล้ว ORDER BY id จะไม่ตรงกับลำดับจริง — บั๊กที่หายากมากเพราะ
 * เกิดเฉพาะตอน insert รัว และดูเหมือนทุกอย่างปกติ
 *
 * monotonicFactory การันตีว่า id ที่สร้างติดกันเรียงเสมอ
 */
const next = monotonicFactory();

export function newId(): string {
  return next();
}

/** ดึงเวลาที่ id ถูกสร้าง — ใช้ตอน debug */
export function idCreatedAt(id: string): Date {
  const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let ms = 0;
  for (const ch of id.slice(0, 10).toUpperCase()) {
    const v = CROCKFORD.indexOf(ch);
    if (v < 0) throw new Error(`ไม่ใช่ ULID: ${id}`);
    ms = ms * 32 + v;
  }
  return new Date(ms);
}

/** วันที่รูปแบบ YYYY-MM-DD ตามที่ schema บังคับไว้ */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** เวลาแบบ ISO-8601 สำหรับคอลัมน์ created_at / updated_at */
export function nowIso(): string {
  return new Date().toISOString();
}
