import { Hono } from 'hono';
import { describe, expect, test } from 'vitest';
import { authMiddleware, type AuthEnv } from '../middleware/auth';
import type { Env } from '../config';
import type { LineIdClaims } from '../services/auth.service';
import { me } from './me.route';

const runEnv = { DB: undefined } as unknown as Env;

function validClaims(): LineIdClaims {
  return { iss: 'https://access.line.me', sub: 'Ureal', aud: 'CHANNEL', exp: 9_999_999_999, name: 'ไว' };
}

function app(): Hono<AuthEnv> {
  const a = new Hono<AuthEnv>();
  a.use(
    '/api/*',
    authMiddleware({
      verifyIdToken: async () => validClaims(),
      upsertUser: async (_db, { lineUserId }) => ({ id: `APP-${lineUserId}` }),
      getChannelId: () => 'CHANNEL'
    })
  );
  a.get('/api/me', me);
  return a;
}

describe('GET /api/me', () => {
  test('มี Bearer → 200 คืน { userId, displayName } จาก context', async () => {
    const res = await app().request('/api/me', { headers: { Authorization: 'Bearer good' } }, runEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'APP-Ureal', displayName: 'ไว' });
  });

  test('ไม่มี Bearer → 401', async () => {
    const res = await app().request('/api/me', {}, runEnv);
    expect(res.status).toBe(401);
  });
});
