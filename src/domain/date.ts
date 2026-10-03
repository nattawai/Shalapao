import { today } from './id';

export type DateRange = { from: string; to: string };

// ช่วงเดือนปัจจุบันตามเวลาไทย — ค่าเริ่มต้นของรายงานรายเดือนเมื่อผู้ใช้ไม่ส่ง from/to
// 🔴 คิดจาก today() (เวลาไทย) ไม่ใช่ date('now') ของ SQLite ซึ่งเป็น UTC — ระหว่างเที่ยงคืน
// ถึงตี 7 ตามเวลาไทย UTC ยังเป็นวันก่อน ต้นเดือน/ปลายเดือนจะเพี้ยนไป 7 ชั่วโมง
// วันสุดท้าย: วันที่ 0 ของ "เดือนถัดไป" = วันสุดท้ายของเดือนนี้ → ก.พ. และปีอธิกสุรทินถูกเอง
// (month เป็นเลข 1-based จึงใช้เป็น monthIndex ของ Date.UTC ได้ตรง ๆ = เดือนถัดไป)
export function currentMonthRange(now: Date = new Date()): DateRange {
  const ymd = today('Asia/Bangkok', now);
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${ymd.slice(0, 7)}-01`, to: `${ymd.slice(0, 7)}-${String(lastDay).padStart(2, '0')}` };
}
