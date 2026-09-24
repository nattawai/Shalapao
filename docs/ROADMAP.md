# ROADMAP — Shalapao

อัปเดตล่าสุด: 2026-09-23

> **ไฟล์นี้ตอบว่า "เหลืออะไร"** — `STATUS.md` ตอบว่า "ตัดสินใจอะไรไปแล้ว"
> ถ้าสองไฟล์ขัดกัน ให้เชื่อ `STATUS.md` แล้วมาแก้ไฟล์นี้
> ขอบเขตแต่ละเวอร์ชันมาจาก `Plans\pocket-app-design.md` §10 — **ห้ามเพิ่มของเข้าเวอร์ชันที่กำลังทำอยู่**

---

## สรุป

| เฟส                         | เวอร์ชัน |
| --------------------------- | -------- |
| **v0 — ใช้เองได้จริง**      | `0.1.0`  |
| v1 — เป้าหมายและแจ้งเตือน   | `0.2.0`  |
| v2 — แบ่งเงินเดือนอัตโนมัติ | `0.3.0`  |
| v3 — บอทและกระเป๋าร่วม      | `0.4.0`  |
| v4 — ภาษีและแผนเสียเงิน     | `0.5.0`  |
| เปิดให้คนนอกใช้             | `1.0.0`  |

▶️ **ถัดไป:** provider + LINE Login channel + LIFF พร้อมแล้ว · backend auth (verify ID token) เสร็จ → เริ่ม `routes/` + LIFF frontend ได้

---

## v0 → `0.1.0` — ใช้เองได้จริง

ขอบเขต: `user` · `pocket` · `pocket_member` · `entry` · `category` · หน้าเดียว (รายการกระเป๋า · ยอดคงเหลือ · เพิ่มรายการ) · LINE Login · **ปุ่มเช็คยอด**

### ฐานราก

- [x] schema + migrations 6 ไฟล์ · ทดสอบบน D1 จริงแล้ว
- [x] D1 database สร้าง + migration รันบน remote ครบ
- [x] โครงโฟลเดอร์ + กฎ dependency ระหว่างชั้น (ESLint)
- [x] CI workflow + PR template
- [x] test harness D1 (workerd + Miniflare) รัน migration จริง
- [x] อัป workers toolchain (wrangler 4 · vitest 4) · เหลือ wrangler ตัวเดียว · `pnpm audit` 0

### domain

- [x] `money.ts` — สตางค์จำนวนเต็ม · `splitProrata()` ผลรวมตรงเสมอ
- [x] `id.ts` — ULID monotonic
- [x] `id.ts` test ครบ — monotonic ordering + timezone rollover (Asia/Bangkok)

### repositories

- [x] `pocket.repository.ts` — อ่าน/สร้าง · กันรั่วข้ามผู้ใช้ทั้ง read และ `parentId`/`categoryId`
- [x] rollup ยอดกระเป๋าแม่ (ยอดตัวเอง + ลูกทุกชั้น) — view `pocket_subtree` (recursive, 0008) + กรอง `pocket_member` ต่อผู้ใช้ใน query เดียว (ไม่ N+1) · `getRollupBalanceAsOf` (มีขอบวัน) พร้อมสำหรับ reconcile กระเป๋าแม่
- [x] `entry.repository.ts` — append-only · โยกเงินสองขาใน batch เดียว · กันลงรายการทับงวดที่กระทบยอดแล้ว (`last_reconciled_at` เกณฑ์ `<=` · เช็คทั้งสองกระเป๋าตอนโยก) · กัน transfer ยอด ≤ 0 และโยกเข้าตัวเอง
- [x] `category.repository.ts` — user-scoped · archived filter
- [ ] แก้/ลบรายการที่กรอกผิด — reversal entry (`reverses_id`) + soft delete (`deleted_at`) · ยังไม่มีฟังก์ชันใน `entry.repository.ts`

### services

- [x] `pocket.service.ts` — forwarder (repository ถือ invariant · route ถือ HTTP mapping · v0 ไม่มีกฎเพิ่ม)
- [x] `entry.service.ts` — forwarder (invariant/append-only/งวดกระทบยอดอยู่ที่ repository · route แปลง error)
- [x] `reconcile.service.ts` — เทียบยอดจริงกับยอดคำนวณ (`getBalanceAsOf` ยอด ณ วันปิดงวด) · ลงรายการปรับ + ตั้ง `last_reconciled_at` ใน batch เดียว · กฎ "เส้นต้องเป็นอดีต" (ใช้ `today()` ไทย ไม่ใช่ SQLite UTC) · เปิดงวดที่ปิดแล้วไม่ได้ (asOfDate == เส้นเดิมทำได้ — แก้ยอดที่กรอกผิด)

### ขอบระบบ

- [x] `zod` validate ทุก input ที่ขอบ — ใช้ที่ `GET/POST /api/pockets` · `/api/categories` · ปฏิเสธ field ที่ไม่รู้จัก
- [x] `GET/POST /api/pockets` · `GET/POST /api/categories` — ยอดเป็นสตางค์จาก view · typed error → HTTP · กันรั่วข้ามผู้ใช้ (test A ไม่เห็นของ B)
- [x] `POST /api/entries` · `POST /api/transfers` · `GET /api/pockets/:id/entries` — zod (amount int≠0 · transfer>0 · occurredOn วันจริง) · 409 ทับงวดกระทบยอด · กระเป๋าคนอื่น → `[]` ไม่ใช่ 404
- [x] `GET /api/pockets/:id/reconcile/preview` (อ่านอย่างเดียว ไม่เขียน) · `POST /api/pockets/:id/reconcile` — 400 เส้นวันนี้/อนาคต/วันไม่จริง/ยอดทศนิยม · 409 เปิดงวดที่ปิดแล้ว · 403 กระเป๋าคนอื่น (ไม่มีแถวเกิด)
- [x] LINE Login → map `userId` เป็น `app_user` — verify ID token กับ LINE · upsert by `line_user_id`
- [x] auth middleware ยัด `userId` ให้ทุก route ใต้ `/api/*` · `userId` มาจาก token ที่ LINE เซ็นเท่านั้น (ไม่รับจาก client) · fail closed เมื่อ LINE ล่ม

### หน้าจอ (LIFF)

- [x] รายการกระเป๋า + ยอดคงเหลือ (LIFF จริง แทนหน้า smoke) — ยอดเป็นบาท · กระเป๋าลูกเยื้อง · ติดลบสีแดง · ว่างชวนสร้างใบแรก · สร้างกระเป๋า (เลือกแม่ได้)
- [x] เพิ่มรายการ (เงินเข้า / เงินออก) — เลือกทิศทางด้วยปุ่ม ไม่ต้องพิมพ์ลบ · วันที่ดีฟอลต์วันนี้ · แตะกระเป๋าดูรายการเดินบัญชี (เข้าเขียว/ออกแดง)
- [x] โยกเงินระหว่างกระเป๋า — กันเลือกกระเป๋าเดียวกันตั้งแต่หน้าจอ
- [ ] **ปุ่มเช็คยอด** — อยู่ v0 ไม่ใช่ v2 เพราะถ้าไม่มีจะเลิกใช้เองภายใน 2 เดือน
- [ ] build `dist/web` + เพิ่ม `wrangler deploy --dry-run` กลับเข้า CI

### LINE + deploy

- [x] สร้าง provider + 2 channels **ภายใต้ provider เดียวกัน** → จดลง `..\_docs\line-provider-channels.md`
- [x] LINE OA: ปิด auto-reply/greeting · Response mode = Bot
- [x] deploy ขึ้น Cloudflare Workers — `https://shalapao.nattawai157.workers.dev`
- [x] ตั้ง LIFF Endpoint URL จริง · พิสูจน์แล้วจากมือถือ: LIFF → verify → D1 → คืน `userId` (Webhook URL ไม่ต้องตอนนี้ — อยู่ v3 พร้อมบอท)

### ปิดเฟส

- [ ] ใช้เองจริงครบ 1 เดือน โดยไม่กลับไปใช้ชีต
- [ ] tag `v0.1.0` + ย้าย `[Unreleased]` ใน `CHANGELOG.md`

---

## v1 → `0.2.0` — เป้าหมายและแจ้งเตือน

- [ ] `goal` — ตั้งเป้าต่อกระเป๋า
- [ ] milestone เป็น **% ของเป้า** · step ปรับได้ · เริ่มที่ 10%
- [ ] achievement `amount` (ถึงยอด)
- [ ] achievement `no_withdraw` (ไม่ถอนติดต่อกัน)
- [ ] view `pocket_net_inflow` ใช้งานจริง — กันการปลดหมุดหมายด้วยการโยกเงิน
- [ ] `payday_rule` — ผู้ใช้เลือกวันเงินเดือนเองได้
- [ ] แจ้งเตือนรายเดือนผูกวันเงินเดือน — **ใช้ reply/in-app เป็นหลัก** push ฟรีแค่ 500/เดือน

---

## v2 → `0.3.0` — แบ่งเงินเดือนอัตโนมัติ

- [ ] `allocation_rule` + วันเริ่มมีผล (แก้กฎแล้วไม่กระทบเดือนที่ผ่านไปแล้ว)
- [ ] กดแบ่งเงินเดือนครั้งเดียว → สร้าง entry ครบทุกกระเป๋า
- [ ] จัดการเศษที่หารไม่ลงตัว — ใช้ `splitProrata()` ที่เขียนไว้แล้ว
- [ ] นำเข้าสรุปรายเดือนจากชีตเดิม
- [ ] ตรวจว่ากฎแบ่งเงินรวมกันไม่เกินเงินที่เข้าจริง

**ค่าบริการรายเดือน (subscription)** — อยู่ v2 เพราะต้องใช้แจ้งเตือน (v1) + กลไกเงินตัดตามรอบ (`allocation_rule`)

- [ ] `subscription` — ชื่อ · ยอดเป็นบาท · รอบ (เดือน/ปี) · วันตัดถัดไป · กระเป๋าที่ถูกตัด
- [ ] สรุปยอดรวมต่อเดือนและต่อปี · แยกตามกระเป๋า
- [ ] ถึงวันตัดแล้วสร้าง `entry` ให้อัตโนมัติ (ผู้ใช้ยืนยันก่อน ไม่ลงเอง)
- [ ] เตือนล่วงหน้าก่อนตัด · เตือนก่อนจบ free trial (ใช้ระบบแจ้งเตือนของ v1)
- [ ] 🔴 **เตือนว่ากระเป๋านั้นเงินไม่พอถึงวันตัด** — นี่คือข้อเดียวที่แอปติดตาม subscription ทั่วไปทำไม่ได้ เพราะมันไม่มียอดคงเหลือจริง เรามี

> **ไม่ทำ:** หลายสกุลเงิน (ธนาคารตัดเป็นบาท — บันทึกยอดที่ถูกตัดจริง) · ซิงก์ Google/Apple Calendar · แยกตามบัตรเครดิต · PWA
> เหตุผล: มีเจ้าตลาดอยู่แล้ว (Billbau และอื่น ๆ) การไล่ตามรายการฟีเจอร์เขาคือการแข่งในสนามที่เราไม่ได้เปรียบ

---

## v3 → `0.4.0` — บอทและกระเป๋าร่วม

- [ ] บอท: พิมพ์ข้อความ → บันทึกรายการ
- [ ] LINE webhook (รับข้อความจากบอท) + **ตรวจ signature ทุก request** · ตั้ง Webhook URL + เปิดสวิตช์ Webhook ใน OA Manager ตอนนี้
- [ ] อ่านสลิป (vision) → **อ่านแล้วลบทันที** เก็บเฉพาะข้อมูลที่สกัดออกมา
- [ ] กระเป๋าร่วม + เชิญสมาชิก
- [ ] สิทธิ์ในกระเป๋าร่วม (ใครแก้ได้ ใครดูได้อย่างเดียว)
- [ ] `left_at` — ออกจากกระเป๋าแล้วประวัติยังอยู่
- [ ] test พิสูจน์ว่าสมาชิกที่ออกแล้วอ่านรายการใหม่ไม่ได้

---

## v4 → `0.5.0` — ภาษีและแผนเสียเงิน

- [ ] `tax_form_template` / `tax_form_item`
- [ ] เงินได้ **40(1) อย่างเดียวก่อน** — ไม่ทำครบ 8 ประเภท
- [ ] เตรียมข้อมูล ภ.ง.ด.91 — **เตรียมให้กรอก ไม่ใช่ยื่นแทน**
- [ ] `entitlement` — โครงแผนเสียเงิน
- [ ] เว็บ checkout (ไม่ใช่ IAP — ค่าธรรมเนียม ~3% vs 30%)

---

## → `1.0.0` — เปิดให้คนนอกใช้

ข้อพวกนี้ **ไม่เกี่ยวกับฟีเจอร์** แต่ไม่ผ่านแล้วเปิดไม่ได้

- [ ] เคาะชื่อโปรดักต์จริง (`Shalapao` เป็น codename)
- [ ] Privacy Policy + Terms URL ที่ระดับ provider — **PDPA บังคับ**
- [ ] branch protection บน `main` + `develop`
- [ ] เปิด secret scanning
- [ ] ไล่ดู git history ทั้งหมดว่าไม่มี secret / ข้อมูลการเงินจริง / `userId` จริง
- [ ] ซ้อมกู้คืน: ถ้า D1 หาย จะเอาข้อมูลผู้ใช้กลับมายังไง

---

## กติกาของไฟล์นี้

- ติ๊กได้เมื่อ **ผ่าน Definition of Done** (`CLAUDE.md` §8) ไม่ใช่เมื่อเขียนโค้ดเสร็จ
- `🔄` = กำลังทำ / อยู่ใน PR · มีได้ทีละไม่กี่อัน ถ้าเกิน 3 แปลว่าเปิดงานพร้อมกันเยอะไป
- **ห้ามเพิ่มข้อเข้าเวอร์ชันที่กำลังทำอยู่** ของใหม่ลงเวอร์ชันถัดไปเสมอ — นี่คือกลไกกันขอบเขตบาน
