import { env } from 'cloudflare:test';
import { describe, expect, test } from 'vitest';
import type { Env } from '../../src/config';
import app from '../../src/index';

const runEnv = env as unknown as Env;

// /health/db เดิมเปิดสาธารณะและ dump รายชื่อ table/view — ยืนยันเป้าหมายให้ผู้โจมตีฟรี
// ตอนนี้ย้ายไปใต้ auth (/api/health/db) และตอบแค่ ok/fail
describe('health endpoints', () => {
  test('/api/health/db ไม่มี token → 401 (อยู่ใต้ auth /api/*)', async () => {
    const res = await app.request('/api/health/db', { method: 'GET' }, runEnv);
    expect(res.status).toBe(401);
  });

  test('/health (ไม่แตะ DB) ยังเปิดสาธารณะ → 200 ok', async () => {
    const res = await app.request('/health', { method: 'GET' }, runEnv);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});
