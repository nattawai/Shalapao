// DB CHECK เช็คแค่โครง '____-__-__' → '2026-99-99' ลอดผ่านได้ · ที่ขอบต้องเช็ค
// "เป็นวันที่จริง" ด้วย: parse แล้ว format กลับต้องได้ค่าเดิม (จับ 2026-99-99, 2026-02-30)
// ใช้ซ้ำที่ schema ของทั้ง entry (occurredOn) และ reconcile (asOfDate) — อยู่ที่เดียว
export function isRealYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
