-- 0005_create_entry.sql
-- ตารางเดียวในระบบที่เก็บตัวเลขเงิน
-- append-only: ไม่มี DELETE · แก้ = เพิ่มรายการกลับ · ลบ = ประทับ deleted_at

CREATE TABLE entry (
  id                 TEXT PRIMARY KEY,                        -- ULID monotonic
  pocket_id          TEXT NOT NULL REFERENCES pocket(id),
  created_by_user_id TEXT NOT NULL REFERENCES app_user(id),   -- ใครใส่ · จำเป็นตอนกระเป๋าร่วม
  amount_satang      INTEGER NOT NULL,                        -- + เข้า / − ออก · จำนวนเต็มเสมอ
  occurred_on        TEXT NOT NULL,                           -- YYYY-MM-DD วันที่เกิดจริง
  category_id        TEXT REFERENCES category(id),            -- ว่างได้ · รายการปรับยอดไม่มีหมวด
  note               TEXT,                                    -- ว่างได้ ไม่บังคับ
  source             TEXT NOT NULL,
  transfer_id        TEXT,                                    -- จับคู่สองขาการโยกเงิน
  reverses_id        TEXT REFERENCES entry(id),               -- รายการนี้กลับรายการไหน
  deleted_at         TEXT,
  updated_at         TEXT,                                    -- แก้ทับได้เฉพาะหลัง last_reconciled_at
  created_at         TEXT NOT NULL,

  CHECK (amount_satang <> 0),
  CHECK (source IN ('manual','rule','reconcile','slip','import')),
  CHECK (occurred_on LIKE '____-__-__'),
  CHECK (reverses_id IS NULL OR reverses_id <> id)
) STRICT;

-- query หลักของทั้งแอป: รายการในกระเป๋าเรียงตามวัน (ไม่เอาที่ลบแล้ว)
CREATE INDEX idx_entry_pocket_date
  ON entry(pocket_id, occurred_on)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_entry_transfer
  ON entry(transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE INDEX idx_entry_reverses
  ON entry(reverses_id)
  WHERE reverses_id IS NOT NULL;
