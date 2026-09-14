-- 0001_create_app_user.sql
-- ตัวตนของผู้ใช้ · รองรับล็อกอินได้สองทาง แต่ต้องมีอย่างน้อยหนึ่ง

CREATE TABLE app_user (
  id            TEXT PRIMARY KEY,            -- ULID (monotonic)
  line_user_id  TEXT UNIQUE,                 -- จาก LINE Login / บอท · ต้องอยู่ provider เดียวกัน
  google_sub    TEXT UNIQUE,                 -- จาก Google SSO
  display_name  TEXT NOT NULL,
  created_at    TEXT NOT NULL,               -- ISO-8601

  CHECK (line_user_id IS NOT NULL OR google_sub IS NOT NULL)
) STRICT;
