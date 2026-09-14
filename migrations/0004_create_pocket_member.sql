-- 0004_create_pocket_member.sql
-- สิทธิ์ · กระเป๋าส่วนตัว = กระเป๋าที่มีสมาชิกคนเดียว ไม่ใช่ชนิดพิเศษ
-- ทุก query ที่แตะข้อมูลการเงินต้องผ่านตารางนี้ ห้ามอ้าง pocket_id ตรง ๆ

CREATE TABLE pocket_member (
  pocket_id  TEXT NOT NULL REFERENCES pocket(id),
  user_id    TEXT NOT NULL REFERENCES app_user(id),
  role       TEXT NOT NULL,
  joined_at  TEXT NOT NULL,
  left_at    TEXT,                 -- ออกแล้วไม่ลบแถว เก็บประวัติว่าเคยอยู่

  PRIMARY KEY (pocket_id, user_id),
  CHECK (role IN ('owner','editor','viewer'))
) STRICT;

-- index ที่ทุก query เรื่องสิทธิ์จะใช้: "ผู้ใช้คนนี้เห็นกระเป๋าอะไรบ้างตอนนี้"
CREATE INDEX idx_member_active_user
  ON pocket_member(user_id, pocket_id)
  WHERE left_at IS NULL;
