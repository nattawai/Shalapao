# Changelog

รูปแบบตาม [Keep a Changelog](https://keepachangelog.com/) · เวอร์ชันตาม [Semantic Versioning](https://semver.org/)

> `0.x.y` = ยังไม่เปิดสาธารณะ · `1.0.0` = วันที่เปิดให้คนนอกใช้

---

## [Unreleased]

### Added
- Schema v0: `app_user` · `category` · `pocket` · `pocket_member` · `entry`
- View `pocket_balance` — ยอดคงเหลือคำนวณสด กรอง `deleted_at` ให้ในที่เดียว
- View `pocket_net_inflow` — ตัดขาโยกเงินออก กันการปลดหมุดหมายด้วยการย้ายเงิน
- `domain/money.ts` — เงินเป็นจำนวนเต็มสตางค์ · `splitProrata()` ที่ผลรวมเท่ายอดเต็มเสมอ
- `domain/id.ts` — ULID จาก `monotonicFactory` · `idCreatedAt()` สำหรับ debug
- `repositories/pocket.repository.ts` — สร้าง/อ่านกระเป๋า กรองสิทธิ์ผ่าน `pocket_member` อัตโนมัติ · อ่านยอดจาก view `pocket_balance` ไม่คำนวณเอง
- ชุดทดสอบ repository บน D1 จริง (workerd + Miniflare) ผ่าน `@cloudflare/vitest-pool-workers`
- กฎ dependency ระหว่างชั้น บังคับด้วย ESLint
- `CLAUDE.md` ระดับโฟลเดอร์ LINE และระดับโปรเจกต์
- LINE Login — ยืนยันตัวตนด้วย ID token ที่ LINE เซ็น · ทุก request ใต้ `/api/*` แนบ `Authorization: Bearer <ID token>` · map เป็น `app_user` อัตโนมัติ (สร้างตัวตนครั้งแรกที่ login · ชื่อเปลี่ยนเมื่อเปลี่ยนจริง)
- `GET/POST /api/pockets` · `GET/POST /api/categories` — ดู/สร้างกระเป๋าและหมวดผ่านแอป · ยอดคงเหลือส่งเป็นสตางค์จำนวนเต็ม (frontend จัดรูปแบบเอง) · ซ่อนกระเป๋า/หมวดที่ archive แล้ว (`?includeArchived=true` เพื่อเห็น) · กรอกไม่ครบหรือใส่ค่านอกกติกาได้ข้อความไทยบอกทางออก

### Changed
- `listPockets` ซ่อนกระเป๋าที่ archive แล้วโดยค่าเริ่มต้น · ขอเห็นได้ผ่าน option `includeArchived`

### Fixed
- `bahtToSatang('')` เดิมคืน `0` เงียบ ๆ (`Number('')` = 0) ตอนนี้โยน error ตามที่ควร
- วันที่ของรายการเคยคลาดเป็นเมื่อวาน — `today()` ใช้ UTC ทำให้รายการที่บันทึกหลังเที่ยงคืนถึงตี 7 (เวลาไทย) ลงเป็นวันก่อนหน้า · แก้ให้อิงเขตเวลาไทย (Asia/Bangkok)
- รายการที่ลงวันในงวดที่กระทบยอดแล้ว (`occurred_on` ≤ `last_reconciled_at`) ถูกปฏิเสธแล้ว — ทั้งการเพิ่มรายการและการโยกเงิน (เช็คทั้งสองกระเป๋า) · กันบั๊กนับซ้ำที่ทำให้ยอดไม่ตรงธนาคาร (ข้อตกลงข้อ 6) · trigger ที่ D1 บังคับ `last_reconciled_at` เป็น YYYY-MM-DD เพื่อให้การเทียบเส้นไม่พลาดเงียบ ๆ
- โยกเงินด้วยจำนวนติดลบหรือ 0 และการโยกเข้ากระเป๋าเดียวกัน ถูกปฏิเสธแล้ว — เดิมยอดติดลบไหลย้อนทาง และโยกเข้าตัวเองสร้างรายการขยะในกระเป๋าเดียว

### Security
- API กันข้อมูลรั่วข้ามผู้ใช้ทั้งชั้น route — test พิสูจน์ว่าผู้ใช้ A เรียก `GET /api/pockets`/`categories` แล้วไม่เห็นของผู้ใช้ B · `parentId`/`categoryId` ของคนอื่น → 403
- `.gitignore` กัน `.dev.vars` · `.env` · `docs/private/` · ไฟล์ข้อมูลการเงินที่ export มาทดสอบ
- บันทึกกฎว่า provider ของบอทกับ LIFF ต้องเป็นตัวเดียวกัน
- test พิสูจน์ว่าผู้ใช้อ่านกระเป๋าของผู้ใช้อื่นไม่ได้ — `getPocket` คืน `null` · `listPockets` ไม่ปนกระเป๋าคนอื่น
- `createPocket` ปฏิเสธ `parentId`/`categoryId` ที่เป็นของผู้ใช้อื่น — FK เช็คแค่ว่าแถวมีอยู่ ไม่เช็คเจ้าของ จึงเป็นช่องรั่วข้ามผู้ใช้ถ้าไม่กันที่ repository
- อัป workers toolchain (wrangler 4 · vitest 4 · miniflare 5 · vite 8) — ช่องโหว่ dev dependency ที่ `pnpm audit` พบหายครบ (30 → 0) และเหลือ wrangler ตัวเดียว
- `userId` มาจาก ID token ที่ LINE เซ็นแล้วทางเดียว — ไม่รับจาก body/header/query ของ client (บังคับด้วย test) · กันการปลอมตัวเป็นผู้ใช้อื่น
- auth **fail closed** — LINE `/verify` timeout หรือตอบ 5xx → ปฏิเสธ (401) ไม่ปล่อยผ่าน · ตอบ 401 แบบไม่บอกเหตุผล เพื่อไม่ให้ผู้โจมตีรู้ว่าพลาดข้อไหน · เพิ่มกฎ ESLint กัน `middleware/` เรียก `repositories/` ตรง ๆ

---

## วิธีเขียนรายการในไฟล์นี้

เขียนสิ่งที่**ผู้ใช้สังเกตเห็น** ไม่ใช่ชื่อ commit
หมวด: `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security`

ตอน release: ย้ายจาก `[Unreleased]` ไปหัวข้อเวอร์ชันพร้อมวันที่ แล้วติด git tag

```
## [0.1.0] — 2026-10-xx
### Added
- กระเป๋า เพิ่มรายการ และปุ่มกระทบยอด
```
