# Migrations — v0

Related: `../CLAUDE.md` · `Shalam Corp Studio\Plans\pocket-app-design.md`

---

## ลำดับไฟล์

| ไฟล์ | สร้างอะไร |
|---|---|
| `0001_create_app_user.sql` | ตัวตนผู้ใช้ |
| `0002_create_category.sql` | หมวดที่ผู้ใช้สร้างเอง |
| `0003_create_pocket.sql` | โครงกระเป๋า |
| `0004_create_pocket_member.sql` | สิทธิ์ |
| `0005_create_entry.sql` | รายการเดินบัญชี |
| `0006_create_views.sql` | ยอดคงเหลือ (VIEW) |

เรียงตาม dependency — `entry` อ้าง 3 ตารางแรกจึงมาท้ายสุด

---

## วิธีรัน

```bash
pnpm db:create              # ครั้งแรกเท่านั้น → เอา database_id ใส่ wrangler.toml
pnpm db:local               # รันกับเครื่องตัวเอง
pnpm db:remote              # รันกับของจริงบน Cloudflare
```

---

## ข้อตกลงที่ฝังอยู่ใน schema

| ข้อตกลง | บังคับด้วยอะไร |
|---|---|
| เงินเป็นจำนวนเต็มสตางค์ | `amount_satang INTEGER` |
| ยอดคงเหลือไม่เก็บ คำนวณเสมอ | ไม่มีคอลัมน์ balance · มี `VIEW pocket_balance` |
| ไม่มีรายการยอด 0 | `CHECK (amount_satang <> 0)` |
| วันที่ต้องเป็น `YYYY-MM-DD` | `CHECK (occurred_on LIKE '____-__-__')` |
| กระเป๋าเป็นพ่อตัวเองไม่ได้ | `CHECK (parent_id <> id)` |
| ต้องมีช่องทางล็อกอินอย่างน้อยหนึ่ง | `CHECK (line_user_id IS NOT NULL OR google_sub IS NOT NULL)` |
| หมวดชื่อซ้ำไม่ได้ (เฉพาะที่ยังใช้อยู่) | partial unique index |
| ย้ายเงินไม่นับเป็นการเก็บเงิน | `VIEW pocket_net_inflow` กรอง `transfer_id IS NULL` |

---

## สิ่งที่ schema บังคับให้ไม่ได้ — เป็นหน้าที่ของโค้ด

1. **ทุก query ต้องกรองผ่าน `pocket_member`** — D1 ไม่มี row-level security · บังคับใน `repositories/` เท่านั้น
2. **สร้าง ULID ด้วย `monotonicFactory`** ไม่ใช่ `ulid()` ตรง ๆ — ดู `src/domain/id.ts`
3. **ห้ามแก้รายการที่ `occurred_on` เก่ากว่า `pocket.last_reconciled_at`** — ต้องออกรายการปรับของวันนี้แทน ไม่งั้นเกิดบั๊กนับซ้ำ
4. **โยกเงินต้อง insert 2 แถวใน transaction เดียว** `transfer_id` เดียวกัน ยอดตรงข้ามกัน
5. **กระทบยอดแล้วต้อง `UPDATE pocket.last_reconciled_at`** ทุกครั้ง

---

## หมายเหตุ

**`STRICT`** บังคับชนิดข้อมูลจริง (SQLite ปกติยอมให้ใส่อะไรก็ได้) ถ้า wrangler บ่นว่าไม่รองรับ ให้ลบคำว่า `STRICT` ท้าย `CREATE TABLE` ออก

**ชื่อ `app_user` ไม่ใช่ `user`** กัน keyword ชนถ้าย้าย engine และไม่ต้อง quote ทุก query

**ไม่มีไฟล์ seed โดยตั้งใจ** — ยอดกระเป๋าไม่ได้มาจากคอลัมน์ แต่มาจาก `entry` การ seed จึงเป็นการ import รายการ ซึ่งต้องทำผ่านสคริปต์ ไม่ใช่ฝังตัวเลขการเงินจริงไว้ในไฟล์ที่ขึ้น repo
