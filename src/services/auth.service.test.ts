import { describe, expect, test, vi } from 'vitest';
import { AuthError, authenticate, type AuthDeps, type LineIdClaims } from './auth.service';

const CHANNEL = '2011608646';
const ISS = 'https://access.line.me';

function validClaims(over: Partial<LineIdClaims> = {}): LineIdClaims {
  return { iss: ISS, sub: 'Uline123', aud: CHANNEL, exp: 9_999_999_999, name: 'ไว', ...over };
}

function deps(over: Partial<AuthDeps> = {}): AuthDeps {
  return {
    channelId: CHANNEL,
    verifyIdToken: vi.fn(async () => validClaims()),
    upsertUser: vi.fn(async () => ({ id: 'app-user-id' })),
    now: () => 1000,
    ...over
  };
}

describe('authenticate', () => {
  test('ไม่มี Authorization header → AuthError', async () => {
    await expect(authenticate(deps(), null)).rejects.toBeInstanceOf(AuthError);
  });

  test('ไม่ใช่ Bearer → AuthError', async () => {
    await expect(authenticate(deps(), 'Basic abc')).rejects.toBeInstanceOf(AuthError);
  });

  // 🔴 fail closed: LINE ล่ม / timeout / token ปลอม (verify โยน) → ต้องปฏิเสธ ห้ามปล่อยผ่าน
  test('verify โยน error → AuthError และไม่แตะ upsert', async () => {
    const upsertUser = vi.fn(async () => ({ id: 'x' }));
    const d = deps({
      verifyIdToken: vi.fn(async () => {
        throw new Error('line down');
      }),
      upsertUser
    });
    await expect(authenticate(d, 'Bearer x')).rejects.toBeInstanceOf(AuthError);
    expect(upsertUser).not.toHaveBeenCalled();
  });

  test('iss ไม่ใช่ access.line.me → AuthError', async () => {
    const d = deps({ verifyIdToken: vi.fn(async () => validClaims({ iss: 'https://evil.example' })) });
    await expect(authenticate(d, 'Bearer x')).rejects.toBeInstanceOf(AuthError);
  });

  test('aud ไม่ตรง channel (token ของแอปอื่น) → AuthError', async () => {
    const d = deps({ verifyIdToken: vi.fn(async () => validClaims({ aud: 'other-app' })) });
    await expect(authenticate(d, 'Bearer x')).rejects.toBeInstanceOf(AuthError);
  });

  test('exp หมดอายุ → AuthError', async () => {
    const d = deps({ verifyIdToken: vi.fn(async () => validClaims({ exp: 999 })), now: () => 1000 });
    await expect(authenticate(d, 'Bearer x')).rejects.toBeInstanceOf(AuthError);
  });

  test('exp เท่ากับ now พอดี → AuthError (ต้อง strictly greater)', async () => {
    const d = deps({ verifyIdToken: vi.fn(async () => validClaims({ exp: 1000 })), now: () => 1000 });
    await expect(authenticate(d, 'Bearer x')).rejects.toBeInstanceOf(AuthError);
  });

  test('token ถูกต้อง → คืน { userId, displayName } · upsert ด้วย sub + name จาก token', async () => {
    const upsertUser = vi.fn(async () => ({ id: 'APP-123' }));
    const result = await authenticate(deps({ upsertUser }), 'Bearer good');
    expect(result).toEqual({ userId: 'APP-123', displayName: 'ไว' });
    expect(upsertUser).toHaveBeenCalledWith({ lineUserId: 'Uline123', displayName: 'ไว' });
  });
});
