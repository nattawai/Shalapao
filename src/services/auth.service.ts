export type LineIdClaims = {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  name?: string;
};

export type VerifyIdToken = (idToken: string, channelId: string) => Promise<LineIdClaims>;
export type UpsertUser = (input: { lineUserId: string; displayName: string }) => Promise<{ id: string }>;

export type AuthDeps = {
  verifyIdToken: VerifyIdToken;
  upsertUser: UpsertUser;
  channelId: string;
  now?: () => number;
};

// AuthError = "ปฏิเสธการเข้าถึง" → middleware แปลงเป็น 401 · error ชนิดอื่น
// (เช่น DB ล้มตอน upsert) ปล่อยขึ้นไปเป็น 500 ไม่ใช่เรื่องของ auth
export class AuthError extends Error {}

const LINE_ISS = 'https://access.line.me';

function parseBearer(header: string | null | undefined): string {
  if (!header) throw new AuthError('ไม่มี Authorization header');
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) throw new AuthError('Authorization ไม่ใช่รูปแบบ Bearer');
  const token = header.slice(prefix.length).trim();
  if (!token) throw new AuthError('Authorization ไม่มี token');
  return token;
}

// ตัวตนมาจาก ID token ที่ LINE เซ็นแล้วทางเดียว — ไม่รับ userId จาก client เด็ดขาด
// (ข้อ 5 กันรั่วข้ามผู้ใช้) · verify ล้มด้วยเหตุใดก็ตาม (LINE ล่ม/timeout/token ปลอม)
// ต้อง fail closed → AuthError ห้ามปล่อยผ่าน
export async function authenticate(
  deps: AuthDeps,
  authorizationHeader: string | null | undefined
): Promise<string> {
  const token = parseBearer(authorizationHeader);

  let claims: LineIdClaims;
  try {
    claims = await deps.verifyIdToken(token, deps.channelId);
  } catch {
    throw new AuthError('ยืนยัน ID token ไม่สำเร็จ');
  }

  // ตรวจซ้ำจาก claims ที่ LINE คืนมา (defense-in-depth · LINE ตรวจให้แล้วชั้นหนึ่ง)
  if (claims.iss !== LINE_ISS) throw new AuthError('iss ไม่ถูกต้อง');
  if (claims.aud !== deps.channelId) throw new AuthError('aud ไม่ตรง channel ของเรา');

  const now = (deps.now ?? (() => Math.floor(Date.now() / 1000)))();
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw new AuthError('ID token หมดอายุ');

  if (!claims.sub) throw new AuthError('ID token ไม่มี sub');

  const { id } = await deps.upsertUser({ lineUserId: claims.sub, displayName: claims.name ?? '' });
  return id;
}
