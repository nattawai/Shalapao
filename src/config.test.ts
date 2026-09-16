import { describe, expect, test } from 'vitest';
import { lineBotCredentials, lineLoginChannelId, type Env } from './config';

// สร้าง env ที่ "มีแต่ตัวของ auth" โดยตั้งใจ — bot secret (v3) ว่างไว้ เลียนแบบ
// production จริงที่ยังไม่ตั้ง secret บอท · การตรวจรวดเดียวทั้งหมดเคยทำให้ /api/me
// พังทั้งที่ใช้แค่ LIFF_LOGIN_CHANNEL_ID
function env(over: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    APP_ENV: 'test',
    LINE_CHANNEL_SECRET: '',
    LINE_CHANNEL_ACCESS_TOKEN: '',
    LIFF_LOGIN_CHANNEL_ID: '',
    ...over
  };
}

describe('lineLoginChannelId', () => {
  // 🔴 หัวใจของบั๊ก: ไม่มี bot secret แต่ auth ต้องทำงานได้
  test('มี LIFF_LOGIN_CHANNEL_ID แม้ไม่มี bot secret → ผ่าน ไม่โยน', () => {
    expect(lineLoginChannelId(env({ LIFF_LOGIN_CHANNEL_ID: '2011608646' }))).toBe('2011608646');
  });

  test('ไม่มี LIFF_LOGIN_CHANNEL_ID → โยน', () => {
    expect(() => lineLoginChannelId(env({ LIFF_LOGIN_CHANNEL_ID: '' }))).toThrow();
  });
});

describe('lineBotCredentials', () => {
  test('มีครบ → คืน { channelSecret, accessToken }', () => {
    const c = lineBotCredentials(env({ LINE_CHANNEL_SECRET: 's', LINE_CHANNEL_ACCESS_TOKEN: 'a' }));
    expect(c).toEqual({ channelSecret: 's', accessToken: 'a' });
  });

  test('ขาด access token → โยน', () => {
    expect(() => lineBotCredentials(env({ LINE_CHANNEL_SECRET: 's', LINE_CHANNEL_ACCESS_TOKEN: '' }))).toThrow();
  });

  test('ขาด channel secret → โยน', () => {
    expect(() => lineBotCredentials(env({ LINE_CHANNEL_SECRET: '', LINE_CHANNEL_ACCESS_TOKEN: 'a' }))).toThrow();
  });
});
