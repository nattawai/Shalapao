-- 0006_create_views.sql
-- ยอดคงเหลือเป็น VIEW ไม่ใช่คอลัมน์
-- เหตุผล: ถ้าเก็บยอดไว้ วันหนึ่งมันจะไม่ตรงกับผลรวมรายการ แล้วจะไม่รู้ว่าอันไหนถูก
-- ผลพลอยได้: ไม่มีใครลืมกรอง deleted_at เพราะ view กรองให้แล้ว

CREATE VIEW pocket_balance AS
SELECT
  p.id                                   AS pocket_id,
  COALESCE(SUM(e.amount_satang), 0)      AS balance_satang,
  COUNT(e.id)                            AS entry_count,
  MAX(e.occurred_on)                     AS last_entry_on
FROM pocket p
LEFT JOIN entry e
  ON e.pocket_id = p.id
 AND e.deleted_at IS NULL
GROUP BY p.id;


-- ยอดที่ "เก็บได้จริง" — ตัดขาโยกเงินออก
-- ใช้กับ run rate และหมุดหมาย ไม่งั้นย้ายเงินข้ามกระเป๋าก็ปลดหมุดได้โดยไม่ได้เก็บเพิ่ม
CREATE VIEW pocket_net_inflow AS
SELECT
  p.id                                   AS pocket_id,
  COALESCE(SUM(e.amount_satang), 0)      AS net_satang
FROM pocket p
LEFT JOIN entry e
  ON e.pocket_id = p.id
 AND e.deleted_at IS NULL
 AND e.transfer_id IS NULL
GROUP BY p.id;
