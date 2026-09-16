/**
 * อ่าน environment ที่เดียวในระบบ (CLAUDE.md §2.1)
 *
 * แต่ตรวจ "เฉพาะตัวที่ผู้เรียกใช้จริง ณ จุดที่ใช้" ไม่ตรวจรวดเดียวทั้งหมด:
 * secret ของบอท (v3) ยังไม่ถูกตั้งโดยตั้งใจ · ถ้าตรวจรวม auth (v0) ที่ใช้แค่
 * LIFF_LOGIN_CHANNEL_ID จะพังทั้งที่ไม่ได้แตะ secret บอทเลย
 */

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: string;
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LIFF_LOGIN_CHANNEL_ID: string;
};

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`ไม่พบตัวแปร ${name} — ดู .env.example`);
  return value;
}

// LINE Login (auth · v0) ใช้ตัวเดียว: client_id ที่ใช้ verify ID token
// ไม่ใช่ความลับ — อยู่ใน wrangler.toml [vars]
export function lineLoginChannelId(env: Env): string {
  return required(env.LIFF_LOGIN_CHANNEL_ID, 'LIFF_LOGIN_CHANNEL_ID');
}

export type LineBotCredentials = { channelSecret: string; accessToken: string };

// Messaging API (บอท · v3 webhook) เท่านั้น — v0 ยังไม่ตั้ง secret พวกนี้
// จึงต้องตรวจตอนเข้าเส้นทางบอทเท่านั้น ไม่ใช่ทุก request
export function lineBotCredentials(env: Env): LineBotCredentials {
  return {
    channelSecret: required(env.LINE_CHANNEL_SECRET, 'LINE_CHANNEL_SECRET'),
    accessToken: required(env.LINE_CHANNEL_ACCESS_TOKEN, 'LINE_CHANNEL_ACCESS_TOKEN')
  };
}
