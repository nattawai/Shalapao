-- 0008_create_rollup_view.sql
-- ยอดของกระเป๋าแม่ต้องรวมยอดลูกทุกชั้น (โมเดลจากชีตเดิม: Total = ผลรวมลูก + ยอดแม่เอง)
-- view pocket_balance เดิมรวมเฉพาะ entry ของใบนั้นเอง → กระเป๋าแม่โชว์ 0 ทั้งที่ลูกถือเงิน
--
-- ทำไมเป็น "โครงสร้างล้วน" ไม่รวมยอด/ไม่กรองสิทธิ์ในตัว view:
-- rollup ที่ถูกต้องต้องกรองผ่าน pocket_member "ต่อผู้ใช้" (ไม่งั้นพอมีกระเป๋าร่วม v3
-- ยอดของกระเป๋าที่คนนั้นไม่ได้แชร์จะรั่วเข้ายอดรวม) แต่ view ไม่มี parameter รับ userId ได้
-- จึงแยกหน้าที่: view นี้ให้แค่ความสัมพันธ์ ancestor→descendant (รวมตัวเอง) ของทั้งต้นไม้
-- แล้วไปกรอง pocket_member + SUM ที่ repository ซึ่ง bind userId ได้ (ดู pocket.repository)
--
-- ไม่มี cycle: parent_id ต้องชี้กระเป๋าที่มีอยู่ก่อนแล้ว (id เป็น ULID ใหม่เสมอตอนสร้าง
-- + CHECK parent_id <> id) ต้นไม้จึง acyclic โดยโครงสร้าง recursive CTE ไม่วนไม่รู้จบ
-- ห้ามแตะ pocket_balance เดิม — ยังใช้เป็น "ยอดของตัวเอง" คู่กับ rollup

CREATE VIEW pocket_subtree AS
WITH RECURSIVE tree(root_id, node_id) AS (
  SELECT id, id FROM pocket
  UNION ALL
  SELECT t.root_id, p.id
  FROM tree t
  JOIN pocket p ON p.parent_id = t.node_id
)
SELECT root_id, node_id FROM tree;
