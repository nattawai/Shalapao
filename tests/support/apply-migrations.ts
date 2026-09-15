import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll } from 'vitest';

// รัน migration ครั้งเดียวต่อไฟล์ ก่อน isolated storage รายเทสต์จะเริ่ม
// schema จาก beforeAll คงอยู่ตลอดไฟล์ ส่วนข้อมูลที่แต่ละ test เขียนถูก rollback ให้เอง
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
