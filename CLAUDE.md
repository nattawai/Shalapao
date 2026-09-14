# CLAUDE.md — Shalapao

Version: 2.1 · Last Updated: 2026-09-14
> อ่าน `..\CLAUDE.md` ก่อนเสมอ — ไฟล์นี้เพิ่มเฉพาะเรื่องของโปรเจกต์นี้
>
> 🔴 **แล้วอ่าน `docs\STATUS.md` ต่อทันที** — บอกว่าตอนนี้อยู่ตรงไหน ตัดสินใจอะไรไปแล้ว รอการอนุมัติอะไร และขั้นถัดไปคืออะไร
> ไฟล์นี้บอก *กติกา* · STATUS บอก *สถานะ* — ต้องอ่านทั้งคู่ถึงจะทำงานต่อได้

---

## 1. โปรเจกต์นี้คืออะไร

แอปกระเป๋าเงินหลายใบบน LINE — **ยอมรับตั้งแต่ต้นว่าคนจะลืมกรอก และยังบอกความจริงได้อยู่ดี**

หัวใจไม่ใช่การจดรายจ่าย แต่คือ **ปุ่มกระทบยอด** ที่ทำให้ตัวเลขกลับมาตรงกับธนาคารได้เสมอ
**ถ้าต้องตัดฟีเจอร์ อย่าตัดอันนี้**

ออกแบบเต็ม: `Shalam Corp Studio\Plans\pocket-app-design.md`

**Stack:** Hono บน Cloudflare Workers · React + Vite เป็น static assets · D1 · LINE Login (LIFF)

**ยังไม่ใช้ Next.js** — v0 มี 4 หน้าจอ ไม่ต้องการ SEO/SSR
ถ้าจะเสนอให้เพิ่ม ต้องตอบก่อนว่า *ต้องการ SSR จริง* หรือ *แค่เพราะอยู่ใน TARGET stack*

---

## 2. 🔴 ข้อตกลง 6 ข้อที่ห้ามผิด

| # | กฎ | ผิดแล้วเกิดอะไร |
|---|---|---|
| 1 | **เงินเป็นจำนวนเต็มสตางค์** ใช้ `domain/money.ts` ห้าม float | ยอดเพี้ยนทีละ 0.01 จนไม่ตรงธนาคาร = ทำลายฟีเจอร์หลัก |
| 2 | **id เป็น ULID จาก `monotonicFactory`** ใช้ `domain/id.ts` | ลำดับเพี้ยนตอน insert รัว · หาสาเหตุยากมาก |
| 3 | **ไม่มี `DELETE`** ลบ = ประทับ `deleted_at` · แก้ = เพิ่มรายการกลับ | ประวัติหาย ย้อนดูยอดในอดีตไม่ได้ |
| 4 | **ยอดคงเหลือไม่เก็บ** อ่านจาก view `pocket_balance` | ยอดที่เก็บจะไม่ตรงกับผลรวมรายการ แล้วไม่รู้ว่าอันไหนถูก |
| 5 | **ทุก query ผ่าน `pocket_member`** ห้ามเขียน SQL จาก `routes/` | ข้อมูลการเงินคนอื่นหลุด |
| 6 | **ห้ามแก้รายการเก่ากว่า `pocket.last_reconciled_at`** ออกรายการปรับของวันนี้แทน | บั๊กนับซ้ำ — เงินงอกจากอากาศ ดูสมเหตุสมผลทุกบรรทัดจนหาไม่เจอ |

**ข้อ 6 ขยายความ:** 1 มี.ค. บันทึกผิด −500 (ที่จริง −50) · 10 มี.ค. กระทบยอดใส่ +450 ชดเชยไปแล้ว · 5 เม.ย. ไปแก้ต้นทางอีก → ระบบชดเชยสองรอบ

---

## 3. สถาปัตยกรรม

### 3.1 ชั้นและทิศทาง

```
routes → services → repositories → D1
         ↘ domain ↙   (ใครเรียกก็ได้ แต่ domain ไม่เรียกใคร)
```

| ชั้น | รับผิดชอบ | ห้าม |
|---|---|---|
| `routes/` | HTTP เท่านั้น — parse · validate ด้วย Zod · แปลง response · status code | business rule · แตะ D1 |
| `services/` | business rule ทั้งหมด · ไม่ผูกกับ Hono เท่าที่ทำได้ | เขียน SQL เอง |
| `repositories/` | เข้าถึง D1 เท่านั้น · ยัด user filter ให้อัตโนมัติ | business rule · อ้างชั้นบน |
| `domain/` | type · เงิน · id · การคำนวณบริสุทธิ์ | side effect · อ้างชั้นไหนก็ตาม |
| `lib/` | ต่อโลกภายนอก — LINE client · vision | business rule |

บังคับด้วย `eslint.config.js` — **lint error เพราะ import ข้ามชั้น ห้ามแก้ด้วยการปิด rule**

### 3.2 Pattern ที่ใช้

- **Repository pattern** คั่น service กับ D1 เพื่อให้ service ทำ unit test ได้โดยไม่ต้องต่อ DB จริง
- **Zod schema ที่ขอบ route** — validate ทุก payload ขาเข้า ปฏิเสธ field ที่ไม่รู้จัก
- **Config ที่เดียว** — อ่าน `c.env` ในที่เดียวแล้วส่งต่อเป็น type ห้ามอ่านกระจัดกระจาย
- **Hono middleware** สำหรับ cross-cutting — auth · logging · แปลง error ไม่ใช่ยัดใน service
- **Service รับ dependency ทาง parameter** ไม่ `new` เองข้างใน เพื่อให้ mock ได้ตอน test

### 3.3 ไม่ใช้

**domain event · CQRS · event sourcing เต็มรูปแบบ** — v0 เป็น CRUD กับ ledger ธรรมดา ใส่เข้ามาคือ over-engineer
ถ้ามีเหตุผลว่าต้องใช้จริง ให้คุยก่อน ห้ามใส่เงียบ ๆ

---

## 4. โครงสร้างโปรเจกต์

```
Shalapao/
  migrations/                  SQL เรียงตาม dependency
  src/
    index.ts                   Hono entry · ประกอบ route · middleware กลาง
    config.ts                  อ่าน env ที่เดียว แล้วส่งต่อเป็น type

    domain/                    บริสุทธิ์ ไม่มี side effect
      money.ts                 Satang · bahtToSatang · splitProrata
      id.ts                    ULID monotonic · today · nowIso
      types.ts
      *.test.ts                test อยู่ข้างไฟล์ที่มันทดสอบ

    services/
      pocket.service.ts
      entry.service.ts
      reconcile.service.ts
      *.test.ts

    repositories/
      pocket.repository.ts
      entry.repository.ts
      *.test.ts

    routes/
      pocket.route.ts
      entry.route.ts
      schemas/                 Zod schema ของแต่ละ route

    lib/
      line.ts

    web/                       React app ของ LIFF

  tests/
    e2e/                       ทดสอบข้ามชั้น · รวม test กันข้อมูลรั่วข้ามผู้ใช้
```

**ตั้งชื่อไฟล์:** `kebab-case` + suffix คั่นด้วยจุด — `entry.service.ts` · `pocket.repository.ts` · `create-entry.schema.ts`
**unit test อยู่ข้างไฟล์ที่ทดสอบ · e2e อยู่ใน `tests/e2e/`**

---

## 5. โค้ดที่ใช้ซ้ำ

- ถ้ามีอะไรถูกใช้มากกว่าหนึ่งที่ → ย้ายไป `domain/` หรือ `lib/` **ห้าม copy-paste**
- `domain/` ไว้สำหรับตรรกะบริสุทธิ์ · `lib/` ไว้สำหรับการต่อโลกภายนอก
- **ทั้งสองที่ไม่ใช่ถังขยะ** สำหรับ business logic ที่ยังหาบ้านไม่ได้ — ถ้าหาบ้านไม่ได้แปลว่ายังออกแบบไม่เสร็จ

---

## 6. Roadmap ↔ เวอร์ชัน

| เวอร์ชัน | ขอบเขต |
|---|---|
| `0.1.0` | **v0** — กระเป๋า · รายการ · กระทบยอด · LINE Login |
| `0.2.0` | v1 — เป้าหมาย · หมุดหมาย · แจ้งเตือนผูกวันเงินเดือน |
| `0.3.0` | v2 — แบ่งเงินเดือนตามกฎ · import จากชีต |
| `0.4.0` | v3 — บอท · สลิป + vision · กระเป๋าร่วม |
| `0.5.0` | v4 — ภาษี 40(1) |
| `1.0.0` | เปิดให้คนนอกใช้ |

**ห้ามลากฟีเจอร์จากเวอร์ชันหลังมาทำก่อนโดยไม่คุยกัน** — ขอบเขตบานคือความเสี่ยงอันดับหนึ่งของโปรเจกต์นี้

**ตัดสินใจแล้วว่าไม่ทำ:** ระบบหารบิล — ขุนทองของ KBTG ทำได้ดีกว่า เราเลือกรับผลลัพธ์จากขุนทองมาลงบัญชีแทน

---

## 7. ข้อมูลทดสอบ

- **ห้ามใช้ยอดเงินจริงของไวเป็น fixture** แต่งตัวเลขขึ้นมาทั้งหมด
- บันทึกที่มีตัวเลขจริงไปไว้ `docs/private/` ซึ่ง gitignore แล้ว
- **test ที่พิสูจน์ว่าผู้ใช้ A เข้าถึงข้อมูลผู้ใช้ B ไม่ได้ — ห้ามลบ ห้าม skip**

---

## 8. คำถามที่ยังไม่ตัดสิน

- repo เป็น public หรือ private
- ชื่อโปรดักต์จริงตอนเปิดสาธารณะ (ตอนนี้ `Shalapao` เป็น codename)
