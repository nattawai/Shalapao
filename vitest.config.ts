import { defineConfig } from 'vitest/config';

// projects อยู่ใน vitest.workspace.ts — ไฟล์นี้เก็บ option ระดับ root
// coverage นับเฉพาะชั้นที่บังคับ TDD (domain/services) ตามที่ตกลงไว้
export default defineConfig({
  test: {
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
