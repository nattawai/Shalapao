import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      include: ['src/domain/**', 'src/services/**'],
      thresholds: {
        // ตั้งสูงเฉพาะชั้นที่บังคับ TDD — routes/web ไม่นับ
        lines: 90,
        functions: 90,
        branches: 85
      }
    }
  }
});
