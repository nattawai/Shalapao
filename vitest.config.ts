import { defineConfig } from 'vitest/config';

// สองโลกที่ต่างกัน (vitest 4 ใช้ test.projects แทน workspace ที่ถูกถอดออก):
//   unit    — domain/services บริสุทธิ์ รันบน node เร็ว ไม่แตะ D1
//   workers — repositories/e2e แตะ D1 จริง ต้องรันใน workerd + Miniflare D1
// coverage นับเฉพาะชั้นที่บังคับ TDD (domain/services) ตามที่ตกลงไว้
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/domain/**/*.test.ts', 'src/services/**/*.test.ts', 'src/lib/**/*.test.ts', 'src/routes/**/*.test.ts'],
          environment: 'node'
        }
      },
      './vitest.workers.config.ts'
    ],
    coverage: {
      include: ['src/domain/**', 'src/services/**'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85
      }
    }
  }
});
