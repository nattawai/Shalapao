import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// repositories เป็นชั้นเดียวที่แตะ D1 จึงต้อง test บน SQLite ของ workerd จริง
// ไม่ใช่ mock — เพราะ test ที่พิสูจน์ว่าข้อมูลไม่รั่วข้ามผู้ใช้จะไม่มีความหมาย
// ถ้า SQL ไม่ได้ถูกรันจริงบน schema จริง
//
// vitest 4 + pool-workers 0.22: workers options ย้ายจาก poolOptions.workers
// ไปเป็น argument ของ plugin cloudflareTest() (ดู codemod vitest-v3-to-v4)
export default defineConfig(async () => {
  const migrations = await readD1Migrations('migrations');
  return {
    plugins: [
      cloudflareTest({
        singleWorker: true,
        miniflare: {
          // ตรงกับ wrangler.toml (production) โดยตั้งใจ — test จึงพิสูจน์ production ได้จริง
          // ค่านี้คือเพดานที่ workerd ใน miniflare 5 รองรับด้วย (เกินกว่านี้ start ไม่ได้)
          // ถ้าจะขยับ production ให้ใหม่กว่านี้ ต้องรอ miniflare รุ่นที่รองรับก่อน
          compatibilityDate: '2026-08-22',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          bindings: { TEST_MIGRATIONS: migrations }
        }
      })
    ],
    test: {
      name: 'workers',
      // repositories แตะ D1 · tests/workers เป็น smoke test ของ domain ที่ต้องรัน
      // ในรันไทม์จริง (เช่น today() ที่พึ่ง Intl timezone ของ workerd)
      include: ['src/repositories/**/*.test.ts', 'tests/workers/**/*.test.ts'],
      setupFiles: ['./tests/support/apply-migrations.ts']
    }
  };
});
