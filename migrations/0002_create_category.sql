-- 0002_create_category.sql
-- หมวดที่ผู้ใช้สร้างเอง · เป็นของ user ไม่ใช่ของ pocket เพราะ "อาหาร" ใช้ได้หลายกระเป๋า

CREATE TABLE category (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES app_user(id),
  name        TEXT NOT NULL,
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at  TEXT NOT NULL
) STRICT;

-- ห้ามชื่อซ้ำในหมวดที่ยังใช้อยู่ แต่ถ้า archive ไปแล้วสร้างชื่อเดิมใหม่ได้
CREATE UNIQUE INDEX idx_category_user_name
  ON category(user_id, name)
  WHERE archived_at IS NULL;
