# Spec — ยกเลิกการตรวจยอด (unreconcile)

`2026-09-25` · สถานะ: **เคาะแล้ว พร้อมลงมือ** · ที่มา: [BACKLOG](../BACKLOG.md) §การตรวจยอด ข้อ 1

> **ข้อ 1 เคาะแล้ว 2026-09-25 → ทางเลือก ข (ตาราง `pocket_reconcile`)**
> ก ตัดทิ้งเพราะพิสูจน์ได้ว่าประวัติขาด · ค ตัดทิ้งเพราะแก้ปัญหาผิดข้อ (ย้ายความกลัวไปอีกฝั่ง)

> เขียนก่อนลงมือโค้ด เพื่อให้คำถามที่ต้องหยุดถามกลางทาง ถูกถามจบตั้งแต่ตอนนี้

---

## 🔴 ข้อ 1 · สิ่งที่ต้องเคาะก่อน — ระบบไม่มีประวัติการตรวจยอด

```sql
-- migrations/0003_create_pocket.sql
last_reconciled_at TEXT   -- คอลัมน์เดียว เขียนทับทุกครั้ง
```

```
25 ส.ค.  ตรวจยอด → last_reconciled_at = '2026-08-25'
23 ก.ย.  ตรวจยอด → last_reconciled_at = '2026-09-23'   ← ค่า 25 ส.ค. หายไปแล้ว
```

**"ถอยกลับไปค่าก่อนหน้า" จึงเป็นไปไม่ได้ในโครงสร้างปัจจุบัน** — ที่เขียนไว้ใน BACKLOG ตอนนั้นผมสมมติว่ามีประวัติ ซึ่งไม่จริง

### ทางเลือก

| | วิธี | ได้ | เสีย |
|---|---|---|---|
| **ก** | ถอยจาก `entry` ที่ `source='reconcile'` | ไม่ต้องเพิ่มตาราง | ❌ **ใช้ไม่ได้** — ตรวจยอดที่ส่วนต่าง = 0 **ไม่สร้าง entry เลย** (`applyReconcile` คืน `null`) ประวัติจึงขาดเป็นช่วง ๆ |
| **ข** | เพิ่มตาราง `pocket_reconcile` เก็บทุกครั้งที่ตรวจ | ถอยได้จริง · ได้ข้อมูลสำหรับ BACKLOG ข้อ 4 ฟรี | ต้องมี migration + backfill |
| **ค** | ยกเลิก = `last_reconciled_at = NULL` | ง่ายที่สุด | ล้างเส้นทั้งหมด ไม่ใช่แค่ครั้งล่าสุด · ตรวจยอดมา 8 เดือน พลาดครั้งเดียวต้องเริ่มใหม่ทั้งหมด |

### 🔵 แนะนำ ข — พร้อมเหตุผล

**ก ตัดทิ้งเพราะพิสูจน์ได้ว่าผิด** ไม่ใช่เพราะไม่ชอบ — `applyReconcile` มี early return ตอน `diffSatang === 0` อ่านโค้ดยืนยันได้

**ค ทำงานได้แต่แก้ปัญหาผิดข้อ** — ปัญหาคือ "กดพลาดครั้งเดียวแล้วถอยไม่ได้" ถ้าถอยแล้วล้างหมด ผู้ใช้จะกลัวปุ่มยกเลิกพอ ๆ กับกลัวปุ่มยืนยัน แค่ย้ายความกลัวไปอีกฝั่ง

**ข แพงกว่าแต่ได้ของแถมที่ต้องทำอยู่แล้ว** — BACKLOG ข้อ 4 ต้องแสดง "ตรวจยอดล่าสุด 23 ก.ย." บนหน้าแรก ซึ่งต้องรู้ว่าตรวจเมื่อไหร่ ยอดเท่าไร ส่วนต่างเท่าไร **ตารางนี้ตอบทั้งสองข้อด้วยงานชิ้นเดียว**

**ที่สำคัญกว่า:** `last_reconciled_at` คือตัวเลขที่บอกว่า "ยอดนี้ยืนยันแล้ว" แต่ตอนนี้ระบบตอบไม่ได้ว่ายืนยันว่าเท่าไร เมื่อไหร่ ใครยืนยัน — **สำหรับแอปที่ขายเรื่องความน่าเชื่อถือของตัวเลข การไม่มีร่องรอยว่าใครยืนยันอะไรไว้ เป็นช่องว่างที่ใหญ่กว่าเรื่องปุ่มถอย**

---

## ข้อ 2 · ตารางใหม่

```sql
-- migrations/00XX_create_pocket_reconcile.sql
-- ประวัติการตรวจยอด — append-only เหมือน entry
-- มีไว้เพื่อ (1) ถอยได้ (2) แสดง "ตรวจยอดล่าสุด" (3) ร่องรอยว่าใครยืนยันอะไร

CREATE TABLE pocket_reconcile (
  id                 TEXT PRIMARY KEY,                       -- ULID monotonic
  pocket_id          TEXT NOT NULL REFERENCES pocket(id),
  reconciled_by      TEXT NOT NULL REFERENCES app_user(id),  -- ใครกดยืนยัน
  as_of_date         TEXT NOT NULL,                          -- ตรวจถึงวันไหน
  expected_satang    INTEGER NOT NULL,                       -- ระบบคิดได้เท่าไร
  actual_satang      INTEGER NOT NULL,                       -- ผู้ใช้กรอกจากธนาคารเท่าไร
  adjustment_id      TEXT REFERENCES entry(id),              -- NULL เมื่อส่วนต่าง = 0
  previous_line      TEXT,                                   -- 🔴 last_reconciled_at ก่อนหน้า · NULL = ครั้งแรก
  cancelled_at       TEXT,                                   -- ยกเลิกเมื่อไหร่ · NULL = ยังมีผล
  created_at         TEXT NOT NULL,

  CHECK (as_of_date LIKE '____-__-__'),
  CHECK (previous_line IS NULL OR previous_line LIKE '____-__-__')
) STRICT;

CREATE INDEX idx_reconcile_pocket
  ON pocket_reconcile(pocket_id, as_of_date)
  WHERE cancelled_at IS NULL;
```

**ทำไมเก็บ `previous_line` แทนที่จะไล่หาแถวก่อนหน้า:** การไล่หาต้องเดาว่า "แถวก่อนหน้า" คือแถวไหนเมื่อมีการยกเลิกซ้อนกัน · เก็บค่าตรง ๆ ตอนเขียน ทำให้การถอยเป็นการอ่านค่าเดียว ไม่ใช่การคำนวณที่ผิดได้

**ทำไม `cancelled_at` แทนการ DELETE:** ตามกฎ append-only ของโปรเจกต์ · และเราอยากรู้ว่าเคยตรวจแล้วยกเลิก ไม่ใช่ทำเหมือนไม่เคยเกิด

### Backfill

```sql
-- กระเป๋าที่มี last_reconciled_at อยู่แล้ว ต้องมีแถวตั้งต้น ไม่งั้นถอยไม่ได้
INSERT INTO pocket_reconcile (id, pocket_id, reconciled_by, as_of_date,
                              expected_satang, actual_satang, adjustment_id,
                              previous_line, created_at)
SELECT
  <ULID ที่ generate ตอนรัน>, p.id,
  (SELECT user_id FROM pocket_member WHERE pocket_id = p.id AND left_at IS NULL LIMIT 1),
  p.last_reconciled_at,
  0, 0, NULL, NULL, <nowIso()>
FROM pocket p
WHERE p.last_reconciled_at IS NOT NULL;
```

⚠️ `expected_satang` และ `actual_satang` ของแถว backfill **เป็น 0 ทั้งคู่เพราะไม่มีข้อมูลจริง** — ห้ามเอาไปแสดงบน UI ว่าเป็นยอดที่ยืนยัน · ถ้าจะแสดง "ตรวจยอดล่าสุด" ต้องเช็ค `adjustment_id IS NULL AND expected_satang = 0 AND actual_satang = 0` แล้วแสดงแค่วันที่

---

## ข้อ 3 · เปลี่ยน `applyReconcile`

เพิ่ม INSERT ลง `pocket_reconcile` เข้าไปใน batch เดิม — **ทั้งสามคำสั่งต้องอยู่ใน `db.batch` เดียว**

```
db.batch([
  INSERT entry (รายการปรับ)        ← ข้ามเมื่อ diff = 0
  INSERT pocket_reconcile           ← ใหม่ · ต้องมีทุกครั้งแม้ diff = 0
  UPDATE pocket SET last_reconciled_at
])
```

🔴 **ต้องอ่าน `pocket.lastReconciledAt` เก็บไว้ก่อน UPDATE** เพื่อใส่ใน `previous_line` — ถ้าอ่านหลัง UPDATE จะได้ค่าใหม่ แล้วการถอยจะวนกลับที่เดิมตลอดไป

---

## ข้อ 4 · ฟังก์ชันใหม่

```ts
// repositories/pocket-reconcile.repository.ts
export async function getLastReconcile(db, userId, pocketId): Promise<ReconcileRecord | null>
export async function cancelReconcile(db, userId, reconcileId): Promise<void>

// services/reconcile.service.ts
export async function unreconcile(db, userId, pocketId): Promise<UnreconcileResult>
```

### `unreconcile` ทำอะไร

```
1  อ่านครั้งล่าสุดที่ยังไม่ถูกยกเลิก      → ไม่เจอ = 404
2  ตรวจสิทธิ์ผ่าน pocket_member          → ไม่ผ่าน = 403
3  ตรวจว่ากระเป๋าแม่ไม่ได้ปิดคลุมอยู่      → ปิดอยู่ = 409   ← ข้อ 5
4  db.batch เดียว:
     UPDATE pocket_reconcile SET cancelled_at = now WHERE id = ?
     UPDATE entry SET deleted_at = now WHERE id = adjustment_id   ← ข้ามถ้า NULL
     UPDATE pocket SET last_reconciled_at = previous_line         ← NULL ได้
```

---

## ข้อ 5 · 🔴 เคสที่จะทำให้พังถ้าไม่ดัก — กระเป๋าแม่

```
Base Make (แม่)  ตรวจยอดถึง 23 ก.ย.
  └ Saving (ลูก) ตรวจยอดถึง 20 ก.ย.

ยกเลิกการตรวจยอดของ Saving → เส้นของ Saving หายไป
แต่เส้นของ Base Make ยังอยู่ที่ 23 ก.ย.
→ ลงรายการย้อนหลังใน Saving วันที่ 21 ก.ย. ได้แล้ว
→ rollup ของ Base Make ณ 23 ก.ย. เปลี่ยน ทั้งที่ยืนยันไปแล้ว
```

**นี่คือรูเดียวกับที่เคยเจอตอนทำ ancestor guard ของการเพิ่มรายการ — ต้องดักฝั่งยกเลิกด้วย**

```
ถ้ากระเป๋าแม่ชั้นใดชั้นหนึ่งมี last_reconciled_at >= as_of_date ของรายการที่จะยกเลิก
→ 409 reconcile_ancestor_locked
→ "ต้องยกเลิกการตรวจยอดของ Base Make (23 ก.ย.) ก่อน"
```

**ยกเลิกจากบนลงล่างเสมอ** เหมือนถอดเสื้อคลุมก่อนถอดเสื้อข้างใน

---

## ข้อ 6 · Error ทั้งหมด

| code | HTTP | เมื่อไหร่ | ข้อความ |
|---|---|---|---|
| `pocket_forbidden` | 403 | ไม่ใช่สมาชิก | ไม่มีสิทธิ์ในกระเป๋านี้ |
| `reconcile_not_found` | 404 | ไม่เคยตรวจยอด | ยังไม่เคยตรวจยอดกระเป๋านี้ จึงไม่มีอะไรให้ยกเลิก |
| `reconcile_ancestor_locked` | 409 | แม่ปิดคลุมอยู่ | ต้องยกเลิกการตรวจยอดของ `{ชื่อแม่}` (`{วันที่}`) ก่อน เพราะยอดรวมของกระเป๋านั้นนับกระเป๋านี้อยู่ด้วย |

**ทุกข้อความต้องบอกว่าทำอะไรต่อได้ ไม่ใช่บอกแค่ว่าทำไม่ได้** (BACKLOG ข้อ 3)

---

## ข้อ 7 · Test cases — เขียนก่อนโค้ด

`services/reconcile.service.test.ts` · 🔴 บังคับ red-green-refactor ตาม CLAUDE.md §4.1

```
happy path
  [ ] ยกเลิกแล้ว last_reconciled_at กลับไปเป็นค่าก่อนหน้า
  [ ] ยกเลิกครั้งแรกสุด → last_reconciled_at = NULL
  [ ] รายการปรับถูก soft delete (deleted_at ไม่ใช่ NULL)
  [ ] ยอดกระเป๋ากลับไปเท่ากับก่อนตรวจยอด          ← ข้อพิสูจน์ที่แท้จริง
  [ ] ตรวจยอดที่ส่วนต่าง = 0 (ไม่มี adjustment) ยกเลิกได้ ไม่ throw

validation
  [ ] ไม่เคยตรวจยอด → reconcile_not_found
  [ ] ยกเลิกซ้ำสองครั้ง → ครั้งที่สองถอยไปอีกขั้น ไม่ใช่ error
  [ ] ยกเลิกจนหมด แล้วยกเลิกอีก → reconcile_not_found

ancestor guard  🔴 ห้ามข้าม
  [ ] แม่ปิดคลุมวันของลูก → 409 reconcile_ancestor_locked
  [ ] แม่ปิดก่อนวันของลูก → ยกเลิกลูกได้
  [ ] แม่ 3 ชั้น ชั้นบนสุดปิดคลุม → 409 และข้อความอ้างถึงชั้นบนสุด

กันข้อมูลรั่วข้ามผู้ใช้  🔴 ห้ามลบ ห้าม skip
  [ ] ผู้ใช้ B ยกเลิกการตรวจยอดของกระเป๋าผู้ใช้ A ไม่ได้ → 403
  [ ] ผู้ใช้ B อ่าน getLastReconcile ของกระเป๋าผู้ใช้ A ไม่ได้ → null

atomic
  [ ] batch ล้มกลางคัน → ไม่มีอะไรเปลี่ยนสักอย่าง
```

**test ที่สำคัญที่สุดคือ "ยอดกระเป๋ากลับไปเท่ากับก่อนตรวจยอด"** — อีก 4 ข้อเป็นการเช็คกลไก ข้อนี้เช็คผลลัพธ์ที่ผู้ใช้เห็นจริง · ถ้าเหลือเวลาเขียนได้ข้อเดียว เขียนข้อนี้

---

## ข้อ 8 · API และ UI

```
DELETE /api/pockets/:id/reconcile      ยกเลิกครั้งล่าสุด
GET    /api/pockets/:id/reconcile      อ่านครั้งล่าสุด (สำหรับแสดงบนหน้าแรก)
```

**UI ต้องยืนยันก่อน และต้องบอกผลลัพธ์เป็นตัวเลข ไม่ใช่ถามว่าแน่ใจไหม**

```
ยกเลิกการตรวจยอดของ มือเติบ ?

ตรวจไว้เมื่อ 23 ก.ย. · ยอดที่ยืนยัน 3,443.70
ยกเลิกแล้ว รายการปรับ −276.00 จะถูกลบ และยอดจะกลับเป็น 3,719.70

[ ยกเลิกการตรวจยอด ]   [ ไม่เอา ]
```

---

## ข้อ 9 · ลำดับงาน

```
1  migration + backfill                 ← พิสูจน์บน D1 จริงว่า backfill ถูก
2  test ทั้งหมดในข้อ 7 (แดงหมด)
3  repository + applyReconcile
4  service unreconcile + ancestor guard
5  route + UI
6  pnpm check เขียว → PR
```

**ห้ามรวมข้อ 1 กับข้อ 3 เป็น commit เดียว** — migration ต้อง revert ได้แยกจากโค้ด

---

## สิ่งที่ spec นี้ยังตอบไม่ได้

- **ยกเลิกได้ย้อนหลังกี่ครั้ง** — ตอนนี้ออกแบบให้ถอยได้ไม่จำกัด · อาจต้องจำกัดถ้าพบว่ามีคนถอยรัวจนยอดมั่ว แต่ยังไม่มีหลักฐานว่าจะเกิด **ไม่จำกัดไว้ก่อน จำกัดทีหลังง่ายกว่าปลดล็อกทีหลัง**
- **เตือนไหมถ้ายกเลิกการตรวจยอดที่เก่ามาก** (เช่น 6 เดือนที่แล้ว) — รอดูจากการใช้จริง
