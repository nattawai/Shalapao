import type { LineIdClaims } from '../services/auth.service';

const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

// เรียก LINE ให้ verify ลายเซ็น/exp/aud ของ ID token แล้วคืน claims ที่ถอดแล้ว
// (เราไม่ decode JWT เอง — LINE เป็นคนถือกุญแจ) · ไม่คืนอะไรที่ไม่ผ่าน 200:
// 400 = token ปลอม/หมดอายุ/aud ผิด · 5xx = LINE ล่ม · โยนทั้งคู่ให้ service fail closed
export async function verifyLineIdToken(idToken: string, channelId: string): Promise<LineIdClaims> {
  // timeout กัน LINE ค้าง — ถ้าไม่มี AbortSignal request จะค้างตลอด ไม่ throw
  // แล้ว fail closed (service จับ error → AuthError → 401) ก็ไม่ทำงาน · abort = fetch reject
  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) throw new Error(`LINE verify ตอบกลับ ${res.status}`);
  return (await res.json()) as LineIdClaims;
}
