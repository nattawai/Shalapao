# Shalapao — ชาลาเปา

แอปกระเป๋าเงินหลายใบบน LINE · เก็บเงิน ตั้งเป้า และกระทบยอดให้ตรงธนาคารเสมอ

Version: 0.0.1 · Status: **v0 — กำลังสร้าง**
Owner: ไว (world_wai / waivern) · Shalam Corporation
Design: `../../..\Shalam Corporation\Shalam Corp Studio\Plans\pocket-app-design.md`

---

## ชื่อนี้มาจากไหน

`Shala` จาก **Shalam** + `pao` จาก **กระเป๋า** · อ่านว่า *ชาลาเปา*
ซาลาเปามีไส้อยู่ข้างใน เหมือนกระเป๋ามีเงินอยู่ข้างใน

---

## ระบบนี้คืออะไร

**แอปกระเป๋าเงินหลายใบ ที่ยอมรับตั้งแต่ต้นว่าคนจะลืมกรอก และยังบอกความจริงได้อยู่ดี**

แอปจดรายจ่ายไม่ได้ตายเพราะกรอกยาก — มันตายตอนตัวเลขไม่ตรงกับธนาคาร แล้วเจ้าของเลิกเชื่อ
ระบบนี้จึงมีปุ่ม **กระทบยอด** ที่ทำให้กลับมาตรงได้เสมอ ไม่ว่าจะขาดหายไปกี่วัน

---

## Stack

| ชั้น | ใช้อะไร |
|---|---|
| Backend | Hono บน Cloudflare Workers |
| Frontend | React + Vite เสิร์ฟเป็น static assets จาก Worker เดียวกัน |
| Database | Cloudflare D1 (SQLite) |
| Auth | LINE Login (LIFF) · Google SSO เพิ่มทีหลัง |

**ยังไม่ใช้ Next.js** — v0 มี 4 หน้าจอ ไม่ต้องการ SEO/SSR ตาม `Tech Stack.md`: *"งานเล็กไม่จำเป็นต้องลาก Next.js มาทั้งชุด อย่า over-engineer"*

---

## โครงโฟลเดอร์

```
Shalapao/
├─ migrations/        SQL · เรียงตามลำดับ dependency
├─ src/
│  ├─ index.ts        Hono entry
│  ├─ routes/         HTTP บาง ๆ — แปลง request/response เท่านั้น
│  ├─ services/       business rule ทั้งหมด
│  ├─ repositories/   แตะ D1 ได้ที่เดียวในระบบ
│  ├─ domain/         type · money · id · ไม่มี side effect
│  ├─ lib/            liff · line client
│  └─ web/            React app ของ LIFF
├─ tests/
└─ wrangler.toml
```

### กฎ dependency

```
routes → services → repositories → D1
```

**บังคับด้วย ESLint** ใน `eslint.config.js` ไม่ใช่พึ่งวินัย
เหตุผล: `repositories/` คือที่เดียวที่ยัด `pocket_member` filter ให้อัตโนมัติ — D1 ไม่มี row-level security ลืมกรองแถวเดียวเท่ากับข้อมูลการเงินคนอื่นหลุด

---

## เริ่มยังไง

```bash
pnpm install

# สร้าง D1 แล้วเอา database_id ไปใส่ใน wrangler.toml
pnpm db:create
pnpm db:local          # รัน migration กับเครื่องตัวเอง

cp .env.example .dev.vars   # แล้วเติม LINE secret
pnpm dev
```

ดูเรื่อง LINE provider/channel ที่ `../_docs/line-provider-channels.md`
🔴 **บอทกับ LIFF ต้องอยู่ provider เดียวกัน** ไม่งั้นได้ `userId` คนละตัวสำหรับคนเดียวกัน

---

## ข้อตกลงที่ห้ามผิด

1. **เงินเป็นจำนวนเต็มสตางค์** ห้าม float — ใช้ `domain/money.ts`
2. **id เป็น ULID จาก `monotonicFactory`** ห้ามเรียก `ulid()` ตรง ๆ — ใช้ `domain/id.ts`
3. **ไม่มี `DELETE`** ลบ = ประทับ `deleted_at` · แก้ = เพิ่มรายการกลับ
4. **ยอดคงเหลือไม่เก็บ** อ่านจาก view `pocket_balance` เสมอ
5. **ทุก query ผ่าน `pocket_member`** ห้ามเขียน SQL จาก `routes/`
6. **แก้รายการเก่ากว่า `pocket.last_reconciled_at` ไม่ได้** ต้องออกรายการปรับของวันนี้แทน ไม่งั้นเกิดบั๊กนับซ้ำ

---

## สถานะ v0

- [x] Schema + migrations
- [x] โครงโฟลเดอร์ + กฎ dependency
- [x] `domain/money.ts` · `domain/id.ts`
- [ ] `git init` + commit แรก
- [ ] repositories layer
- [ ] API + หน้าเว็บ
- [ ] ปุ่มกระทบยอด
