import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { describe, expect, test } from 'vitest';
import { authMiddleware, type AuthEnv, type AuthMiddlewareDeps } from './auth';
import type { Env } from '../config';
import type { LineIdClaims } from '../services/auth.service';

const runEnv = env as unknown as Env;

// upsert ถูก stub — การพิสูจน์ว่า login ซ้ำไม่สร้างซ้ำอยู่ที่ app-user.repository.test
// ที่นี่พิสูจน์งานของ middleware: header → authenticate → ยัด userId · map 401
function appWith(over: Partial<AuthMiddlewareDeps>): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use(
    '/api/*',
    authMiddleware({
      verifyIdToken: async () => validClaims(),
      upsertUser: async (_db, { lineUserId }) => ({ id: `APP-${lineUserId}` }),
      getChannelId: () => 'CHANNEL',
      ...over
    })
  );
  app.post('/api/me', async (c) => {
    const body = (await c.req.json()) as { userId?: string };
    return c.json({ resolved: c.get('userId'), displayName: c.get('displayName'), bodyUserId: body.userId ?? null });
  });
  return app;
}

function validClaims(): LineIdClaims {
  return { iss: 'https://access.line.me', sub: 'Ureal', aud: 'CHANNEL', exp: 9_999_999_999, name: 'ไว' };
}

describe('authMiddleware', () => {
  test('ไม่มี Authorization → 401 { error: unauthorized } ไม่บอกเหตุผล', async () => {
    const app = appWith({
      verifyIdToken: async () => {
        throw new Error('ไม่ควรถูกเรียก');
      }
    });
    const res = await app.request('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, runEnv);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  // 🔴 ตัวตนมาจาก token ที่ verify แล้วเท่านั้น — body.userId ปลอม ถูกเมิน
  test('body ส่ง userId ปลอม → ใช้ id จาก token (sub) ไม่ใช่จาก body', async () => {
    const app = appWith({});
    const res = await app.request(
      '/api/me',
      { method: 'POST', headers: { Authorization: 'Bearer good', 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'EVIL' }) },
      runEnv
    );
    expect(res.status).toBe(200);
    const out = (await res.json()) as { resolved: string; displayName: string; bodyUserId: string };
    expect(out.resolved).toBe('APP-Ureal');
    expect(out.resolved).not.toBe('EVIL');
    expect(out.displayName).toBe('ไว');
  });

  // 🔴 fail closed: LINE ล่ม / token ปลอม (verify โยน) → 401 ไม่ปล่อยผ่าน
  test('verify โยน → 401', async () => {
    const app = appWith({
      verifyIdToken: async () => {
        throw new Error('line down');
      }
    });
    const res = await app.request(
      '/api/me',
      { method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: '{}' },
      runEnv
    );
    expect(res.status).toBe(401);
  });
});
