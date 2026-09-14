/**
 * อ่าน environment ที่เดียวในระบบ
 *
 * ห้ามอ่าน c.env กระจัดกระจายทั่วโค้ด เพราะ:
 * 1. ไม่รู้ว่าโปรเจกต์ต้องการตัวแปรอะไรบ้างจนกว่าจะรันแล้วพัง
 * 2. ตอนเขียน test ต้อง mock หลายที่
 * 3. เสี่ยงเผลอ log ค่า secret ในจุดที่ลืมไป
 */

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: string;
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LIFF_ID: string;
};

export type AppConfig = {
  isProduction: boolean;
  line: {
    channelSecret: string;
    accessToken: string;
    liffId: string;
  };
};

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`ไม่พบตัวแปร ${name} — ดู .env.example`);
  return value;
}

export function loadConfig(env: Env): AppConfig {
  return {
    isProduction: env.APP_ENV === 'production',
    line: {
      channelSecret: required(env.LINE_CHANNEL_SECRET, 'LINE_CHANNEL_SECRET'),
      accessToken: required(env.LINE_CHANNEL_ACCESS_TOKEN, 'LINE_CHANNEL_ACCESS_TOKEN'),
      liffId: required(env.LIFF_ID, 'LIFF_ID')
    }
  };
}
