-- 0003_create_pocket.sql
-- โครงของกระเป๋า · ไม่มีคอลัมน์ยอดเงินโดยตั้งใจ — ยอดคำนวณจาก entry เสมอ

CREATE TABLE pocket (
  id                 TEXT PRIMARY KEY,
  parent_id          TEXT REFERENCES pocket(id),   -- ซ้อนชั้น เช่น Base Make เป็นพ่อของ Saving/Visa/...
  name               TEXT NOT NULL,
  kind               TEXT NOT NULL,                -- enum ระบบ ผู้ใช้แก้ไม่ได้
  category_id        TEXT REFERENCES category(id), -- ป้ายที่ผู้ใช้ตั้งเอง
  sort_order         INTEGER NOT NULL DEFAULT 0,
  last_reconciled_at TEXT,                         -- เส้นแบ่ง: รายการก่อนหน้านี้แก้ทับไม่ได้
  archived_at        TEXT,                         -- ไม่ลบกระเป๋า เพราะ entry เก่ายังอ้างอยู่
  created_at         TEXT NOT NULL,

  CHECK (kind IN ('holds_balance','flow_through')),
  CHECK (parent_id IS NULL OR parent_id <> id)
) STRICT;

CREATE INDEX idx_pocket_parent ON pocket(parent_id) WHERE parent_id IS NOT NULL;
