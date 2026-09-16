-- 0007_pocket_reconciled_format.sql
-- บังคับ pocket.last_reconciled_at ให้เป็น YYYY-MM-DD ที่ระดับ D1
--
-- ทำไม TRIGGER ไม่ใช่ CHECK: SQLite ไม่มี ALTER TABLE ADD CONSTRAINT และ pocket
-- เป็น STRICT ที่มี FK ชี้เข้า 3 เส้น (pocket.parent_id · pocket_member · entry)
-- การ rebuild ตารางเพื่อยัด CHECK ต้องคุม PRAGMA legacy_alter_table/foreign_keys
-- คร่อมไว้ ซึ่ง D1 migration คุมกลางคันไม่ได้ · trigger ได้ invariant เดียวกัน
-- โดยไม่แตะ FK graph ของตารางที่ถือ entry เงินทั้งหมด
--
-- ทำไมต้องบังคับ: guard ใน entry.repository เทียบ occurred_on (YYYY-MM-DD) กับ
-- เส้นแบบ string · ถ้าเส้นเป็น ISO timestamp '2026-03-15T10:00:00Z' การเทียบจะ
-- พลาดเงียบ ๆ ('2026-03-15' <= '2026-03-15T10:00:00Z' เป็น true) → ปฏิเสธผิด/ผ่านผิด

CREATE TRIGGER pocket_reconciled_format_insert
BEFORE INSERT ON pocket
WHEN NEW.last_reconciled_at IS NOT NULL
     AND NEW.last_reconciled_at NOT LIKE '____-__-__'
BEGIN
  SELECT RAISE(ABORT, 'last_reconciled_at ต้องเป็น YYYY-MM-DD');
END;

CREATE TRIGGER pocket_reconciled_format_update
BEFORE UPDATE OF last_reconciled_at ON pocket
WHEN NEW.last_reconciled_at IS NOT NULL
     AND NEW.last_reconciled_at NOT LIKE '____-__-__'
BEGIN
  SELECT RAISE(ABORT, 'last_reconciled_at ต้องเป็น YYYY-MM-DD');
END;
