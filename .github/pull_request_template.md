## Summary
<!-- เปลี่ยนอะไร -->

## Reason
<!-- ทำไม -->

## Task Size
<!-- Small / Medium / Large -->

## Testing
<!-- เทสยังไง · test ตัวไหนครอบเคสไหน -->

## Decisions
<!-- ลิงก์ Decision Log ถ้ามี -->

---

## Checklist

- [ ] test ของ `domain/` `services/` เขียนก่อนโค้ด และผ่านทั้งหมด
- [ ] `pnpm check` ผ่านไม่มี error
- [ ] ไม่มี query ที่ข้าม `pocket_member` หรือข้ามชั้น
- [ ] ไม่มี float กับจำนวนเงิน
- [ ] ไม่มี comment ที่พูดซ้ำโค้ด · ไม่มี dead code
- [ ] ไม่มี secret หรือข้อมูลการเงินจริงในไฟล์ใด ๆ
- [ ] `CHANGELOG.md` อัปเดต ถ้าผู้ใช้เห็นความเปลี่ยนแปลง
- [ ] `CLAUDE.md` อัปเดต ถ้า convention เปลี่ยน
