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
          // ต่างจาก wrangler.toml (production = 2026-09-14) โดยตั้งใจ:
          // workerd ที่ miniflare 5 ฝังมารองรับ compat date สูงสุด 2026-08-22
          // และ miniflare 5 เปลี่ยนจาก fallback+warning เป็น hard error แล้ว
          // ถ้าตั้งเกินนี้ workerd จะไม่ start — ใช้ค่าสูงสุดที่ binary รองรับ
          compatibilityDate: '2026-08-22',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          bindings: { TEST_MIGRATIONS: migrations }
        }
      })
    ],
    test: {
      name: 'workers',
      include: ['src/repositories/**/*.test.ts'],
      setupFiles: ['./tests/support/apply-migrations.ts']
    }
  };
});
