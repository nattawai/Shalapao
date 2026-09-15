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

### Changed
- `listPockets` ซ่อนกระเป๋าที่ archive แล้วโดยค่าเริ่มต้น · ขอเห็นได้ผ่าน option `includeArchived`

### Fixed
- `bahtToSatang('')` เดิมคืน `0` เงียบ ๆ (`Number('')` = 0) ตอนนี้โยน error ตามที่ควร

### Security
- `.gitignore` กัน `.dev.vars` · `.env` · `docs/private/` · ไฟล์ข้อมูลการเงินที่ export มาทดสอบ
- บันทึกกฎว่า provider ของบอทกับ LIFF ต้องเป็นตัวเดียวกัน
- test พิสูจน์ว่าผู้ใช้อ่านกระเป๋าของผู้ใช้อื่นไม่ได้ — `getPocket` คืน `null` · `listPockets` ไม่ปนกระเป๋าคนอื่น
- `createPocket` ปฏิเสธ `parentId`/`categoryId` ที่เป็นของผู้ใช้อื่น — FK เช็คแค่ว่าแถวมีอยู่ ไม่เช็คเจ้าของ จึงเป็นช่องรั่วข้ามผู้ใช้ถ้าไม่กันที่ repository
- อัป workers toolchain (wrangler 4 · vitest 4 · miniflare 5 · vite 8) — ช่องโหว่ dev dependency ที่ `pnpm audit` พบหายครบ (30 → 0) และเหลือ wrangler ตัวเดียว

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
