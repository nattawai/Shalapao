import { afterEach, describe, expect, test, vi } from 'vitest';
import { verifyLineIdToken } from './line';

afterEach(() => {
  vi.restoreAllMocks();
});

function stubFetch(fn: () => Promise<Response>): ReturnType<typeof vi.fn> {
  const f = vi.fn(fn);
  vi.stubGlobal('fetch', f);
  return f;
}

describe('verifyLineIdToken', () => {
  test('200 → คืน claims', async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ iss: 'https://access.line.me', sub: 'U1', aud: 'C', exp: 1 }), {
        status: 200
      })
    );
    const claims = await verifyLineIdToken('tok', 'C');
    expect(claims.sub).toBe('U1');
  });

  test('POST form-urlencoded พร้อม id_token + client_id ไปที่ /verify', async () => {
    const f = stubFetch(async () => new Response(JSON.stringify({ sub: 'U1' }), { status: 200 }));
    await verifyLineIdToken('mytoken', 'mychannel');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/oauth2/v2.1/verify');
    expect(init.method).toBe('POST');
    const body = init.body as URLSearchParams;
    expect(body.get('id_token')).toBe('mytoken');
    expect(body.get('client_id')).toBe('mychannel');
  });

  // 🔴 token ปลอม/หมดอายุ/aud ผิด → LINE ตอบ 400 → ต้องโยน (service จับเป็น 401)
  test('400 → โยน error', async () => {
    stubFetch(async () => new Response('{"error_description":"IdToken expired"}', { status: 400 }));
    await expect(verifyLineIdToken('tok', 'C')).rejects.toThrow();
  });

  // 🔴 fail closed: LINE ล่ม (5xx) → โยน ห้ามคืน claims เปล่า
  test('500 → โยน error', async () => {
    stubFetch(async () => new Response('upstream error', { status: 500 }));
    await expect(verifyLineIdToken('tok', 'C')).rejects.toThrow();
  });

  // 🔴 fail closed: เน็ตหลุด/timeout (fetch reject) → โยน
  test('fetch reject → โยน error', async () => {
    stubFetch(async () => {
      throw new Error('network');
    });
    await expect(verifyLineIdToken('tok', 'C')).rejects.toThrow();
  });
});
