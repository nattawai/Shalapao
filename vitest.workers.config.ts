import { defineWorkersProject, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

// repositories เป็นชั้นเดียวที่แตะ D1 จึงต้อง test บน SQLite ของ workerd จริง
// ไม่ใช่ mock — เพราะ test ที่พิสูจน์ว่าข้อมูลไม่รั่วข้ามผู้ใช้จะไม่มีความหมาย
// ถ้า SQL ไม่ได้ถูกรันจริงบน schema จริง
export default defineWorkersProject(async () => {
  const migrations = await readD1Migrations('migrations');
  return {
    test: {
      name: 'workers',
      include: ['src/repositories/**/*.test.ts', 'tests/e2e/**/*.test.ts'],
      setupFiles: ['./tests/support/apply-migrations.ts'],
      poolOptions: {
        workers: {
          singleWorker: true,
          miniflare: {
            compatibilityDate: '2026-09-14',
            compatibilityFlags: ['nodejs_compat'],
            d1Databases: ['DB'],
            bindings: { TEST_MIGRATIONS: migrations }
          }
        }
      }
    }
  };
});
