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
- กฎ dependency ระหว่างชั้น บังคับด้วย ESLint
- `CLAUDE.md` ระดับโฟลเดอร์ LINE และระดับโปรเจกต์

### Security
- `.gitignore` กัน `.dev.vars` · `.env` · `docs/private/` · ไฟล์ข้อมูลการเงินที่ export มาทดสอบ
- บันทึกกฎว่า provider ของบอทกับ LIFF ต้องเป็นตัวเดียวกัน

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
