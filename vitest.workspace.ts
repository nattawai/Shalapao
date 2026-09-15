import { defineWorkspace } from 'vitest/config';

// สองโลกที่ต่างกัน:
//   unit    — domain/services บริสุทธิ์ รันบน node เร็ว ไม่แตะ D1
//   workers — repositories แตะ D1 จริง ต้องรันใน workerd + Miniflare D1
export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['src/domain/**/*.test.ts', 'src/services/**/*.test.ts'],
      environment: 'node'
    }
  },
  './vitest.workers.config.ts'
]);
