/**
 * เงินในระบบนี้เป็น "จำนวนเต็มสตางค์" เสมอ
 *
 * ห้ามใช้ float กับเงินเด็ดขาด — ค่าอย่าง 758.63 กับ 666.67 บวกกันไม่กี่พันครั้ง
 * ก็เริ่มเพี้ยนทีละ 0.01 แล้วยอดจะไม่ตรงกับธนาคาร ซึ่งทำลายทั้งระบบ
 * เพราะฟีเจอร์หลักของแอปนี้คือ "ตัวเลขตรงกับธนาคารเสมอ"
 */

export type Satang = number;

export function bahtToSatang(baht: string | number): Satang {
  const n = typeof baht === 'string' ? Number(baht.replace(/,/g, '').trim()) : baht;
  if (!Number.isFinite(n)) throw new Error(`จำนวนเงินไม่ถูกต้อง: ${String(baht)}`);
  return Math.round(n * 100);
}

export function satangToBaht(s: Satang): string {
  return (s / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatBaht(s: Satang): string {
  return `฿${satangToBaht(s)}`;
}

/**
 * แบ่งเงินตามสัดส่วน โดยรับประกันว่าผลรวมเท่ากับยอดเต็มเสมอ
 *
 * ปัญหาที่แก้: หาร 200 ให้ 3 คนตามสัดส่วน จะได้ทศนิยมไม่ลงตัว
 * ถ้าปัดแต่ละก้อนแยกกัน ผลรวมจะไม่เท่ากับ 200 → ยอดไม่บาลานซ์
 * ซึ่งเป็นบั๊กที่ทำให้คนเลิกเชื่อถือทั้งระบบ ไม่ใช่แค่ฟีเจอร์เดียว
 *
 * วิธีแก้: ปัดลงทุกก้อน แล้วโยนเศษที่เหลือให้ "เจ้าภาพ" (remainderTo)
 *
 * @param remainderTo index ของคนที่รับเศษ — ปกติคือเจ้าของบิล หรือกระเป๋ามือเติบ
 */
export function splitProrata(
  total: Satang,
  weights: number[],
  remainderTo = 0
): Satang[] {
  if (weights.length === 0) throw new Error('ต้องมีอย่างน้อยหนึ่งส่วน');
  if (remainderTo < 0 || remainderTo >= weights.length) {
    throw new Error('remainderTo อยู่นอกช่วง');
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error('น้ำหนักรวมต้องมากกว่า 0');

  const floored = weights.map((w) => Math.floor((total * w) / sum));
  const allocated = floored.reduce((a, b) => a + b, 0);
  const remainder = total - allocated;

  // เขียนแบบ immutable แทนการแก้ผ่าน index เพราะ noUncheckedIndexedAccess
  // มอง arr[i] เป็น number | undefined เสมอ — การใช้ map ทำให้ไม่ต้องใส่ !
  // ปิดปาก TypeScript ซึ่งจะทำลายจุดประสงค์ของ flag ไปเปล่า ๆ
  return floored.map((part, i) => (i === remainderTo ? part + remainder : part));
}

/** แบ่งเท่า ๆ กัน เศษตกที่เจ้าภาพเช่นกัน */
export function splitEqual(total: Satang, n: number, remainderTo = 0): Satang[] {
  return splitProrata(total, new Array<number>(n).fill(1), remainderTo);
}
