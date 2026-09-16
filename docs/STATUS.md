# STATUS — Shalapao

อัปเดตล่าสุด: 2026-09-16
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
| **`pnpm check` (typecheck · lint · test)** | ✅ ผ่านหมด (ทุก project) |
| `typescript-eslint` (flat config) | ✅ เพิ่มแล้ว · `recommended` เปิด |
| git init + push commit แรก | ✅ อยู่บน `main` แล้ว |
| **migration รันบน D1 remote** | ✅ ครบ 6 ไฟล์ · `d1_migrations` track ถูกต้อง |
| `repositories/pocket.repository.ts` + test | ✅ TDD · กันรั่วข้ามผู้ใช้ทั้ง read และ `parentId`/`categoryId` · list ซ่อน archived |
| `entry.repository.ts` + test | ✅ TDD · append-only · โยกสองขา · กันงวดกระทบยอด (`<=`) · amount>0 · from≠to |
| auth: `middleware/auth` · `services/auth.service` · `repositories/app-user.repository` · `lib/line` | ✅ TDD · LINE Login verify ID token · `userId` จาก token เท่านั้น · fail closed |
| test harness D1 (`vitest-pool-workers`) | ✅ workerd + Miniflare D1 รัน migration จริง |
| workers toolchain | ✅ wrangler 4.124.0 (ตัวเดียว) · vitest 4.1.11 · pool-workers 0.22 · miniflare 5 · vite 8 |
| `pnpm audit` (dev dependency) | ✅ 0 ช่องโหว่ (จาก 30) · sharp บังคับ `^0.35.4` ผ่าน `pnpm.overrides` |
| LINE provider + channels | ✅ provider + LINE Login channel + LIFF สร้างแล้ว (ทะเบียนใน `..\_docs`) · bot (Messaging API) = v3 |
| `services/` `routes/` `web/` | 🔄 `auth.service` แล้ว · `pocket/entry/reconcile.service` · `routes/` · `web/` ❌ |
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
| `wrangler` pin เป๊ะ `4.124.0` (ไม่ใส่ `^`) | ตัวเดียวในไฟล์ที่ตรึงเป๊ะ | `@cloudflare/vitest-pool-workers@0.22` hard-pin `wrangler@4.124.0` เป๊ะ · ถ้าใส่ `^` วันหนึ่ง `pnpm update`/dependabot จะบวก direct เป็น 4.13x ขณะ pool-workers ยัง 4.124.0 → มี wrangler สองตัว (miniflare ซ้อน · vuln ย้อนกลับ) · ตรึงให้ตรงกับที่ pool-workers ใช้ = การันตี wrangler ตัวเดียว · ขยับพร้อมกันเมื่ออัป pool-workers |
| pin transitive ผ่าน `pnpm.overrides` ไม่ใช่ direct dep | `sharp` เท่านั้น (มีเพดาน `^0.35.4`) | เราไม่ได้ import sharp/vite เอง มันมากับ miniflare/vitest · การประกาศเป็น direct dep = โกหกว่าโปรเจกต์ใช้ · vite 8 มากับ vitest อยู่แล้ว (ไม่ต้อง override) · sharp native = 0.35.2 (มี advisory libheif) จึง override เป็น `^0.35.4` — ใช้ `^` ไม่ใช่ `>=` เพื่อกัน major ใหม่หลุดเข้ามาเงียบ ๆ แล้ว wrangler พัง |
| ด่านกันแก้งวดที่กระทบยอดแล้ว (ข้อตกลงข้อ 6) อยู่ที่ **repository** ไม่ใช่ service | guard `occurred_on <= last_reconciled_at` ใน `entry.repository` (createEntry + createTransfer เช็คทั้งสองกระเป๋า) | insert เกิดที่ไฟล์นั้นที่เดียว — ด่านต้องอยู่ตรง insert เหมือน user filter · service เพิ่ม error ที่อ่านง่ายทีหลังได้ แต่ห้ามเป็นด่านเดียว |
| `last_reconciled_at` = วันที่ปิดงวดแล้วเท่านั้น (ห้ามวันนี้/อนาคต) · เก็บเป็น YYYY-MM-DD | `reconcile.service` บังคับ "ห้ามวันนี้/อนาคต" ตอนตั้งเส้น · trigger 0007 บังคับรูปแบบที่ D1 | ถ้าเส้น = วันนี้ รายการของวันนี้จะโดนปฏิเสธ → ผู้ใช้ต้องโกหกวันใน ledger = ทำลายสิ่งเดียวที่แอปสัญญา · เส้นเป็นอดีตเสมอจึงไม่บล็อกรายการวันนี้ และ entry ปรับยอด (ลงวันนี้) ไม่ชนเส้นตั้งแต่แรก ไม่ต้องพึ่งลำดับการเรียก · `date('now')` ของ SQLite เป็น UTC เชื่อไม่ได้ กฎ "วันนี้" จึงอยู่ที่ service ไม่ใช่ migration |
| auth: ตัวตนมาจาก LINE ID token เท่านั้น · verify ที่ server · fail closed | `middleware/auth` อ่าน `Authorization` → `services/auth.service` (verify+aud/exp/iss+upsert · dep ฉีดทาง parameter) → `app-user.repository` | D1 ไม่มี row-level security — รับ `userId` จาก client แม้ทางเดียว = ปลอมเป็นคนอื่นได้ · LINE ล่มแล้วปล่อยผ่าน = เปิดประตูทิ้ง จึง fail closed (401) · ไม่ decode JWT เอง (LINE ถือกุญแจ) เลยไม่ต้องเพิ่ม dependency · `LIFF_LOGIN_CHANNEL_ID` ไม่ใช่ความลับ อยู่ `[vars]` |

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

อนุมัติและเพิ่มแล้ว: `typescript-eslint` · `@cloudflare/vitest-pool-workers` (0.22 — เข้ากับ vitest 4.1)

---

## 5. ขั้นถัดไป — เรียงลำดับ

1. LIFF frontend เรียก `liff.getIDToken()` แล้วแนบ `Authorization: Bearer <token>` — backend auth พร้อมแล้ว
2. `routes/` ตัวแรก (pocket) — อ่าน `c.get('userId')` ส่งต่อ repository · ต้องเพิ่ม `zod` (รออนุมัติ §4)
3. `services/` — `pocket.service` · `entry.service` · `reconcile.service` (reconcile ต้องบังคับ "เส้นห้ามวันนี้/อนาคต")
4. deploy: ตั้ง secret `LINE_*` ด้วย `wrangler secret put` · รัน migration ล่าสุด (0007 trigger) บน D1 remote แล้วยืนยันว่าขึ้นจริง
5. เคาะ public/private → ตั้ง branch protection บน `main` + `develop`

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
| compat date | production (`wrangler.toml`) กับ test (miniflare) ตั้งตรงกันที่ `2026-08-22` เพื่อให้ test พิสูจน์ production ได้ · ค่านี้คือเพดานที่ miniflare 5 ของ pool-workers รองรับ (miniflare 5 เปลี่ยนเป็น **hard error** ถ้าเกิน ไม่ fallback แล้ว) · จะขยับให้ใหม่กว่านี้ได้เมื่อ miniflare รุ่นที่รองรับออก และตอนนั้นขยับทั้งสองที่พร้อมกัน |
| CI ต้องรัน 2 project | `vitest.config.ts` `test.projects` แยก unit (node) กับ workers (workerd) · CI ต้องมี workerd โหลดได้ |
| `wrangler deploy --dry-run` | ลบออกจาก CI แล้ว (รอ `dist/web`) · เพิ่มกลับตอนมี web build |
| coverage threshold 90% | `pnpm check` ไม่ได้รัน coverage · จะเจอตอนรัน `--coverage` เท่านั้น · ลดเหลือ 80 ได้ แต่อย่าปิด |
| LINE provider | ถ้าตั้งบอทกับ LIFF คนละ provider = `userId` คนละตัว แก้ยากมากตอนมีข้อมูลแล้ว |
| `dist/web/index.html` | หน้า smoke test **ชั่วคราว** สำหรับ first deploy (โหลด LIFF SDK จาก CDN · ไม่มี build) · **แทนที่** ตอนทำหน้าจอจริง (LIFF/React) ไม่ใช่ต่อยอดจากมัน · `/api/me` ก็เป็น route ชั่วคราวคู่กัน |
