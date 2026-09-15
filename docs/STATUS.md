# STATUS — Shalapao

อัปเดตล่าสุด: 2026-09-15
> **อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง** — บอกว่าตอนนี้อยู่ตรงไหน ตัดสินใจอะไรไปแล้ว และทำอะไรต่อ
> Repo: https://github.com/nattawai/Shalapao

---

## 1. สถานะตอนนี้ — `0.1.0-dev` (v0 กำลังสร้าง)

| | สถานะ |
|---|---|
| Schema + migrations (6 ไฟล์) | ✅ เขียนแล้ว **และทดสอบบน D1 จริงผ่านแล้ว** |
| โครงโฟลเดอร์ + กฎ dependency (ESLint) | ✅ |
| `domain/money.ts` + test 15 เคส | ✅ |
| `domain/id.ts` (ULID monotonic) | ✅ |
| `src/config.ts` · `src/index.ts` | ✅ โครง |
| CI workflow + PR template | ✅ |
| D1 database | ✅ สร้างแล้ว · `f1a47802-736f-4b02-bc53-bc3cc8316688` · APAC |
| `pnpm install` / lockfile | ✅ |
| **`pnpm check` (typecheck · lint · test)** | ✅ ผ่านหมด · 30 test |
| `typescript-eslint` (flat config) | ✅ เพิ่มแล้ว · `recommended` เปิด |
| git init + push commit แรก | ✅ อยู่บน `main` แล้ว |
| **migration รันบน D1 remote** | ✅ ครบ 6 ไฟล์ · `d1_migrations` track ถูกต้อง |
| `repositories/pocket.repository.ts` + test | ✅ TDD · กันรั่วข้ามผู้ใช้ทั้ง read และ `parentId`/`categoryId` · list ซ่อน archived |
| test harness D1 (`vitest-pool-workers`) | ✅ workerd + Miniflare D1 รัน migration จริง |
| workers toolchain | ✅ wrangler 4.124.0 (ตัวเดียว) · vitest 4.1.11 · pool-workers 0.22 · miniflare 5 · vite 8 |
| `pnpm audit` (dev dependency) | ✅ 0 ช่องโหว่ (จาก 30) · sharp บังคับ `>=0.35.4` ผ่าน `pnpm.overrides` |
| LINE provider + channels | ❌ |
| `services/` `routes/` `web/` | ❌ ยังไม่เริ่ม |
| branch protection + public/private | ❌ ยังไม่เคาะ |

---

## 2. ตัดสินใจไปแล้ว — อย่ารื้อโดยไม่มีข้อมูลใหม่

| เรื่อง | เลือก | เหตุผลย่อ |
|---|---|---|
| ชื่อโปรเจกต์ | **Shalapao** | `Shala` จาก Shalam + `pao` จากกระเป๋า · อ่าน *ชาลาเปา* · เป็น codename เปลี่ยนได้ |
| ชนิด `id` | **ULID (monotonic)** ไม่ใช่ UUIDv7 | D1 เก็บทั้งคู่เป็น TEXT อยู่ดี → ข้อได้เปรียบเรื่องมาตรฐานของ v7 หายไป เหลือแค่ ULID สั้นกว่า 10 ตัวและไม่มีขีด (ดับเบิลคลิกเลือกได้ทั้งก้อน) |
| วันที่ | `TEXT` ISO-8601 | SQLite ไม่มีชนิด DATE · เรียงแบบ string ได้ · อ่านออกตอน debug |
| เงิน | `INTEGER` สตางค์ | float ทำให้ยอดเพี้ยนจนไม่ตรงธนาคาร = ทำลายฟีเจอร์หลัก |
| Frontend | **ยังไม่ใช้ Next.js** | v0 มี 4 หน้าจอ ไม่ต้องการ SEO/SSR — `Tech Stack.md` เตือนเรื่อง over-engineer ไว้เอง |
| แพลตฟอร์ม | **LIFF** ไม่ใช่ native app | ไม่ต้องมี Mac ไม่ต้องจ่าย Apple $99/ปี · เขียนชุดเดียวใช้ทั้ง iOS/Android |
| การขาย (ถ้ามี) | เว็บ checkout ไม่ใช่ IAP | App Store 30% vs เว็บ ~3% |
| ระบบหารบิล | ❌ **ไม่ทำ** | ขุนทองของ KBTG ทำได้ดีกว่า (มี K PLUS + อ่าน e-Slip อัตโนมัติ) → เราเลือกรับผลลัพธ์จากขุนทองมาลงบัญชีแทน |
| เวอร์ชัน | SemVer · `1.0.0` = เปิดสาธารณะ | นับตามจำนวน merge จะถึง 1.0 ก่อนพร้อมจริง |
| TDD | บังคับเฉพาะ `domain/` `services/` | บังคับ 100% กับ plumbing → คนเลิกทำทั้งหมด |
| ปุ่มกระทบยอด | อยู่ **v0** ไม่ใช่ v2 | ถ้า v0 ไม่มี จะเลิกใช้เองภายใน 2 เดือน |
| Milestone | % ของเป้า · step ปรับได้ · เริ่ม 10% | % ใช้ได้กับทุกเป้า ไม่ใช่แค่เงินสำรอง |

---

## 3. ยังไม่ตัดสิน — ต้องเคาะ

**repo เป็น public หรือ private**

| | public | private |
|---|---|---|
| branch protection | ✅ ฟรี | ❌ ต้อง GitHub Pro (~฿140/เดือน) |
| commit history เป็นหลักฐานตอนสัมภาษณ์ | ✅ (`MASTER-PLAN.md` ให้ค่าข้อนี้สูง) | ❌ |
| ความเสี่ยง | ทุกอย่างที่ push เป็นสาธารณะถาวร | — |

> **ถ้าจะ public ตอนนี้คือเวลาที่ปลอดภัยที่สุด** เพราะ history ยังว่าง ไม่มี secret ให้หลุดย้อนหลัง

**ชื่อโปรดักต์จริงตอนเปิดสาธารณะ** — ตอนนี้ `Shalapao` เป็น codename

---

## 4. รอการอนุมัติก่อนเพิ่ม (ตาม `CLAUDE.md` ข้อ 6.2)

| แพ็กเกจ | ใช้ทำอะไร | จำเป็นเมื่อ |
|---|---|---|
| `zod` | validate input ที่ขอบ route | เขียน `routes/` ตัวแรก |

อนุมัติและเพิ่มแล้ว: `typescript-eslint` · `@cloudflare/vitest-pool-workers` (0.8.19 — เข้ากับ vitest 2.1)

---

## 5. ขั้นถัดไป — เรียงลำดับ

1. เปิด PR `feature/v0-pocket-repository` → `main` (อย่า merge เข้า main ตรง ๆ)
2. เคาะ public/private → ตั้ง branch protection บน `main` + `develop`
3. `entry.repository.ts` แบบ TDD (append-only · กัน edit ก่อน `last_reconciled_at`)
4. `services/` ตัวแรก (pocket.service) — business rule แยกจาก repository
5. สร้าง LINE provider + 2 channels **ภายใต้ provider เดียวกัน** → จดลง `..\_docs\line-provider-channels.md`

---

## 6. บันทึกการทดสอบ schema (2026-09-14)

รัน migration ทั้ง 6 ไฟล์บน D1 จริง แล้วลบทิ้งหลังทดสอบ — **ไม่ต้องทดสอบซ้ำ**

| ทดสอบ | ผล |
|---|---|
| `STRICT` tables | ✅ ปฏิเสธ TEXT ในคอลัมน์ INTEGER |
| `CHECK (amount_satang <> 0)` | ✅ ปฏิเสธรายการยอด 0 |
| `CHECK (occurred_on LIKE '____-__-__')` | ✅ ปฏิเสธ `14/09/2026` |
| partial index + view | ✅ สร้างได้ |
| `pocket_balance` | ✅ +350,000 กับ −6,100 → ตอบ 343,900 ถูกต้อง |

> ลบทุกอย่างทิ้งแล้วเพื่อให้ `wrangler d1 migrations apply` เป็นเจ้าของการ track migration แต่ผู้เดียว

---

## 7. สิ่งที่ยังเปราะ

| เรื่อง | ระวังอะไร |
|---|---|
| test D1 compat date | miniflare 5 ที่ pool-workers ฝังมา รองรับ compat date สูงสุด `2026-08-22` และ **เปลี่ยนจาก fallback+warning เป็น hard error** · test config จึงตั้ง `2026-08-22` (ต่างจาก production `2026-09-14` ใน `wrangler.toml` ตั้งใจ) · เมื่อ miniflare รุ่นใหม่รองรับ `2026-09-14` ค่อยขยับให้ตรง |
| CI ต้องรัน 2 project | `vitest.config.ts` `test.projects` แยก unit (node) กับ workers (workerd) · CI ต้องมี workerd โหลดได้ |
| `wrangler deploy --dry-run` | ลบออกจาก CI แล้ว (รอ `dist/web`) · เพิ่มกลับตอนมี web build |
| coverage threshold 90% | `pnpm check` ไม่ได้รัน coverage · จะเจอตอนรัน `--coverage` เท่านั้น · ลดเหลือ 80 ได้ แต่อย่าปิด |
| LINE provider | ถ้าตั้งบอทกับ LIFF คนละ provider = `userId` คนละตัว แก้ยากมากตอนมีข้อมูลแล้ว |
