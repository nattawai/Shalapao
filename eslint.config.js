import tseslint from 'typescript-eslint';

// กฎ dependency ระหว่างชั้น — บังคับด้วย lint ไม่ใช่ด้วยวินัย
//
//   routes / middleware  →  services  →  repositories  →  D1
//
// เหตุผลไม่ใช่ความสวยงาม: repositories/ คือที่เดียวที่ยัด pocket_member filter
// ให้อัตโนมัติ ถ้ามีทางเขียน query จากที่อื่นได้ วันหนึ่งจะมีใครข้าม
// แล้วข้อมูลการเงินของผู้ใช้คนอื่นจะหลุด
// middleware/ เป็น glue ชั้นเดียวกับ routes/ — ต้องผ่าน services/ ห้ามแตะ repositories/ ตรง ๆ

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.wrangler/**', 'coverage/**']
  },

  ...tseslint.configs.recommended,

  {
    files: ['src/routes/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/repositories/**', '**/repositories'],
            message: 'routes/ ห้ามเรียก repositories/ ตรง ๆ — ต้องผ่าน services/'
          }
        ]
      }]
    }
  },

  {
    files: ['src/middleware/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/repositories/**', '**/repositories'],
            message: 'middleware/ ห้ามเรียก repositories/ ตรง ๆ — ต้องผ่าน services/ (เหมือน routes/)'
          }
        ]
      }]
    }
  },

  {
    files: ['src/services/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/routes/**', '**/middleware/**'],
            message: 'services/ ห้ามอ้างกลับไปที่ routes/ หรือ middleware/ — dependency ต้องไหลทางเดียว'
          }
        ]
      }]
    }
  },

  {
    files: ['src/repositories/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/services/**', '**/routes/**', '**/middleware/**'],
            message: 'repositories/ ต้องไม่มี business rule และห้ามอ้างชั้นบน'
          }
        ]
      }]
    }
  },

  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/routes/**', '**/services/**', '**/repositories/**', '**/lib/**', '**/middleware/**'],
            message: 'domain/ ต้องบริสุทธิ์ — ไม่มี side effect ไม่อ้างชั้นไหนเลย'
          }
        ]
      }]
    }
  }
);
