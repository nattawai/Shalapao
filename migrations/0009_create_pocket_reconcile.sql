-- 0009_create_pocket_reconcile.sql
-- ประวัติการตรวจยอด — append-only (ใช้ cancelled_at แทน DELETE ตามกฎโปรเจกต์)
-- มีไว้เพื่อ (1) ยกเลิก/ถอยการตรวจยอดได้ (2) แสดง "ตรวจยอดล่าสุด" (3) ร่องรอยว่าใครยืนยันยอด
-- เท่าไร เมื่อไหร่ — สำหรับแอปที่ขายความน่าเชื่อถือของตัวเลข การไม่มีร่องรอยคือช่องว่างใหญ่
--
-- previous_line = last_reconciled_at "ก่อนหน้า" · เก็บค่าตรง ๆ ตอนเขียน เพื่อให้การถอยเป็น
-- การอ่านค่าเดียว ไม่ใช่การเดาว่าแถวก่อนหน้าคือแถวไหน (ผิดได้เมื่อมีการยกเลิกซ้อนกัน)

CREATE TABLE pocket_reconcile (
  id                 TEXT PRIMARY KEY,                       -- ULID (แถวจริงจากแอป) · แถว backfill ใช้ hex ด้านล่าง
  pocket_id          TEXT NOT NULL REFERENCES pocket(id),
  reconciled_by      TEXT NOT NULL REFERENCES app_user(id),  -- ใครกดยืนยัน
  as_of_date         TEXT NOT NULL,                          -- ตรวจถึงวันไหน
  expected_satang    INTEGER NOT NULL,                       -- ระบบคิดได้เท่าไร
  actual_satang      INTEGER NOT NULL,                       -- ผู้ใช้กรอกจากธนาคารเท่าไร
  adjustment_id      TEXT REFERENCES entry(id),              -- NULL เมื่อส่วนต่าง = 0
  previous_line      TEXT,                                   -- last_reconciled_at ก่อนหน้า · NULL = ครั้งแรก
  cancelled_at       TEXT,                                   -- ยกเลิกเมื่อไหร่ · NULL = ยังมีผล
  created_at         TEXT NOT NULL,

  CHECK (as_of_date LIKE '____-__-__'),
  CHECK (previous_line IS NULL OR previous_line LIKE '____-__-__')
) STRICT;

CREATE INDEX idx_reconcile_pocket
  ON pocket_reconcile(pocket_id, as_of_date)
  WHERE cancelled_at IS NULL;

-- Backfill: กระเป๋าที่มี last_reconciled_at อยู่แล้วต้องมีแถวตั้งต้น ไม่งั้นถอยไม่ได้
-- id: migration เป็น static SQL สร้าง ULID (monotonicFactory) ไม่ได้ → ใช้ hex(randomblob) เป็น
-- id unique ต่อแถว · ยอมรับ deviation จากกฎ ULID เฉพาะแถว seed ประวัตินี้ (ไม่ใช่ ledger ·
-- ต้องการแค่ unique · เคาะกับไว 2026-09-28) · created_at เป็น ISO ผ่าน strftime
-- 🔴 expected/actual = 0 เพราะไม่มีข้อมูลจริง — ห้ามแสดงเป็นยอดยืนยัน · ก่อนแสดง "ตรวจยอดล่าสุด"
-- ต้องเช็ค adjustment_id IS NULL AND expected_satang = 0 AND actual_satang = 0 แล้วโชว์แค่วันที่
INSERT INTO pocket_reconcile (id, pocket_id, reconciled_by, as_of_date,
                              expected_satang, actual_satang, adjustment_id,
                              previous_line, created_at)
SELECT
  lower(hex(randomblob(16))),
  p.id,
  (SELECT user_id FROM pocket_member WHERE pocket_id = p.id AND left_at IS NULL LIMIT 1),
  p.last_reconciled_at,
  0, 0, NULL, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pocket p
WHERE p.last_reconciled_at IS NOT NULL;
