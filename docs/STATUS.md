# STATUS — Shalapao

อัปเดตล่าสุด: 2026-09-14
> **อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง** — บอกว่าตอนนี้อยู่ตรงไหน ตัดสินใจอะไรไปแล้ว และทำอะไรต่อ
> Repo: https://github.com/nattawai/Shalapao

---

## 1. สถานะตอนนี้ — `0.1.0-dev` (v0 กำลังสร้าง)

| | สถานะ |
|---|---|
| Schema + migrations (6 ไฟล์) | ✅ เขียนแล้ว **และทดสอบบน D1 จริงผ่านแล้ว** |
| โครงโฟลเดอร์ + กฎ dependency (ESLint) | ✅ |
| `domain/money.ts` + test 12 เคส | ✅ |
| `domain/id.ts` (ULID monotonic) | ✅ |
| `src/config.ts` · `src/index.ts` | ✅ โครง |
| CI workflow + PR template | ✅ |
| D1 database | ✅ สร้างแล้ว · `f1a47802-736f-4b02-bc53-bc3cc8316688` · APAC |
| `pnpm install` / lockfile | ❌ ยังไม่ได้รัน |
| git init + push | ❌ |
| LINE provider + channels | ❌ |
| `repositories/` `services/` `routes/` `web/` | ❌ ยังไม่เริ่ม |

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
| `typescript-eslint` | ESLint 9 flat config ต้องใช้กับ TS | `pnpm lint` รอบแรก |
| `@cloudflare/vitest-pool-workers` | จำลอง D1 เพื่อ test `repositories/` | เขียน repository ตัวแรก |

---

## 5. ขั้นถัดไป — เรียงลำดับ

1. `pnpm install` → `pnpm check`
2. `git init` + push commit แรก (เข้า `main` ตรงได้ครั้งเดียว เพราะ repo ยังว่าง)
3. เคาะ public/private → ตั้ง branch protection บน `main` + `develop`
4. `pnpm db:remote` (database_id ใส่ใน `wrangler.toml` แล้ว · DB ว่างพร้อมรับ)
5. สร้าง LINE provider + 2 channels **ภายใต้ provider เดียวกัน** → จดลง `..\_docs\line-provider-channels.md`
6. เริ่ม `repositories/` ตัวแรกแบบ TDD

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
| `pnpm check` รอบแรก | น่าจะแดงเพราะขาด `typescript-eslint` |
| CI ขั้น `wrangler deploy --dry-run` | อาจ fail ถ้ายังไม่มี `dist/web` — ลบ step ออกก่อนได้ |
| coverage threshold 90% | อาจบล็อก PR แรก ๆ · ลดเหลือ 80 ได้ แต่อย่าปิด |
| LINE provider | ถ้าตั้งบอทกับ LIFF คนละ provider = `userId` คนละตัว แก้ยากมากตอนมีข้อมูลแล้ว |
