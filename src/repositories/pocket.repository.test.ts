import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, test } from 'vitest';
import { ConflictError, ForbiddenError } from '../domain/errors';
import { newId, nowIso, today } from '../domain/id';
import { archivePocket, createPocket, getPocket, listPockets, unarchivePocket, updatePocket } from './pocket.repository';

const db = env.DB;

async function seedUser(id: string, name: string): Promise<void> {
  await db
    .prepare('INSERT INTO app_user (id, line_user_id, display_name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, `U-${id}`, name, nowIso())
    .run();
}

async function insertEntry(pocketId: string, userId: string, amountSatang: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO entry (id, pocket_id, created_by_user_id, amount_satang, occurred_on, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'manual', ?)`
    )
    .bind(newId(), pocketId, userId, amountSatang, today(), nowIso())
    .run();
}

async function seedCategory(userId: string, name: string): Promise<string> {
  const id = newId();
  await db
    .prepare('INSERT INTO category (id, user_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, userId, name, nowIso())
    .run();
  return id;
}

async function forceArchive(pocketId: string): Promise<void> {
  await db.prepare('UPDATE pocket SET archived_at = ? WHERE id = ?').bind(nowIso(), pocketId).run();
}

async function countPockets(): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM pocket').first<{ n: number }>();
  return row?.n ?? -1;
}

// ทุก test เริ่มจากฐานว่าง (isolated storage rollback ให้) จึง seed ใหม่ทุกครั้ง
let alice: string;
let bob: string;

beforeEach(async () => {
  alice = newId();
  bob = newId();
  await seedUser(alice, 'Alice');
  await seedUser(bob, 'Bob');
});

describe('createPocket', () => {
  test('สร้างกระเป๋าแล้วเจ้าของอ่านกลับมาได้ · ยอดเริ่มที่ 0', async () => {
    const created = await createPocket(db, alice, { name: 'เงินเก็บ', kind: 'holds_balance' });

    expect(created.id).toBeTruthy();
    expect(created.name).toBe('เงินเก็บ');
    expect(created.kind).toBe('holds_balance');
    expect(created.role).toBe('owner');
    expect(created.balanceSatang).toBe(0);

    const fetched = await getPocket(db, alice, created.id);
    expect(fetched?.id).toBe(created.id);
  });

  test('บันทึกความเป็นเจ้าของผ่าน pocket_member ไม่ใช่คอลัมน์บน pocket', async () => {
    const created = await createPocket(db, alice, { name: 'ค่ากิน', kind: 'holds_balance' });

    const member = await db
      .prepare('SELECT role FROM pocket_member WHERE pocket_id = ? AND user_id = ? AND left_at IS NULL')
      .bind(created.id, alice)
      .first<{ role: string }>();
    expect(member?.role).toBe('owner');
  });
});

describe('getPocket / listPockets — ยอดมาจาก view', () => {
  test('balanceSatang เท่ากับผลรวม entry เสมอ ไม่ได้คำนวณเองในโค้ด', async () => {
    const p = await createPocket(db, alice, { name: 'บิล', kind: 'holds_balance' });
    await insertEntry(p.id, alice, 350000);
    await insertEntry(p.id, alice, -6100);

    const fetched = await getPocket(db, alice, p.id);
    expect(fetched?.balanceSatang).toBe(343900);
  });

  test('listPockets คืนเฉพาะกระเป๋าที่ผู้ใช้เป็นสมาชิก active', async () => {
    await createPocket(db, alice, { name: 'A1', kind: 'holds_balance' });
    await createPocket(db, alice, { name: 'A2', kind: 'holds_balance' });
    await createPocket(db, bob, { name: 'B1', kind: 'holds_balance' });

    const aliceList = await listPockets(db, alice);
    expect(aliceList.map((p) => p.name).sort()).toEqual(['A1', 'A2']);
  });

  test('สมาชิกที่ออกแล้ว (left_at) มองไม่เห็นกระเป๋าอีก', async () => {
    const p = await createPocket(db, alice, { name: 'กระเป๋าร่วม', kind: 'holds_balance' });
    await db
      .prepare('UPDATE pocket_member SET left_at = ? WHERE pocket_id = ? AND user_id = ?')
      .bind(nowIso(), p.id, alice)
      .run();

    expect(await getPocket(db, alice, p.id)).toBeNull();
    expect(await listPockets(db, alice)).toHaveLength(0);
  });
});

describe('createPocket — parent/category ต้องเป็นของผู้ใช้เดียวกัน', () => {
  test('parentId ที่เป็นกระเป๋าของตัวเอง → สร้างได้ · เก็บค่าถูก', async () => {
    const parent = await createPocket(db, alice, { name: 'Base', kind: 'holds_balance' });
    const child = await createPocket(db, alice, {
      name: 'Saving',
      kind: 'holds_balance',
      parentId: parent.id
    });
    expect(child.parentId).toBe(parent.id);
  });

  // 🔴 ข้อ 2.3 — FK เช็คแค่ว่าแถวมีอยู่ ไม่ได้เช็คเจ้าของ ต้องกันที่ repository
  test('parentId ที่เป็นกระเป๋าของคนอื่น → ปฏิเสธ ไม่สร้างแถว', async () => {
    const bobsPocket = await createPocket(db, bob, { name: 'ของ Bob', kind: 'holds_balance' });
    const before = await countPockets();

    await expect(
      createPocket(db, alice, { name: 'แอบเกาะ', kind: 'holds_balance', parentId: bobsPocket.id })
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await countPockets()).toBe(before);
    expect(await listPockets(db, alice)).toHaveLength(0);
  });

  test('parentId ที่ไม่มีอยู่จริง → ปฏิเสธ', async () => {
    await expect(
      createPocket(db, alice, { name: 'ลูกกำพร้า', kind: 'holds_balance', parentId: newId() })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  test('categoryId ที่เป็นของตัวเอง → สร้างได้ · เก็บค่าถูก', async () => {
    const cat = await seedCategory(alice, 'อาหาร');
    const p = await createPocket(db, alice, { name: 'ค่ากิน', kind: 'holds_balance', categoryId: cat });
    expect(p.categoryId).toBe(cat);
  });

  // 🔴 categoryId รั่วแบบเดียวกับ parentId — Alice ใส่หมวดของ Bob ไม่ได้
  test('categoryId ที่เป็นของคนอื่น → ปฏิเสธ', async () => {
    const bobsCat = await seedCategory(bob, 'หมวดของ Bob');
    await expect(
      createPocket(db, alice, { name: 'x', kind: 'holds_balance', categoryId: bobsCat })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('listPockets — กระเป๋าที่ archive แล้ว', () => {
  test('ค่าเริ่มต้นไม่คืนกระเป๋าที่ archive แล้ว', async () => {
    const live = await createPocket(db, alice, { name: 'ยังใช้', kind: 'holds_balance' });
    const gone = await createPocket(db, alice, { name: 'เก็บแล้ว', kind: 'holds_balance' });
    await forceArchive(gone.id);

    const list = await listPockets(db, alice);
    expect(list.map((p) => p.id)).toEqual([live.id]);
  });

  test('includeArchived: true คืนทั้งที่ยังใช้และที่ archive แล้ว', async () => {
    const live = await createPocket(db, alice, { name: 'ยังใช้', kind: 'holds_balance' });
    const gone = await createPocket(db, alice, { name: 'เก็บแล้ว', kind: 'holds_balance' });
    await forceArchive(gone.id);

    const list = await listPockets(db, alice, { includeArchived: true });
    expect(list.map((p) => p.id).sort()).toEqual([live.id, gone.id].sort());
  });

  test('getPocket ยังคืนกระเป๋าที่ archive แล้ว — เรียกเจาะจง id เพื่อดู/กู้คืน', async () => {
    const p = await createPocket(db, alice, { name: 'เก็บแล้ว', kind: 'holds_balance' });
    await forceArchive(p.id);

    const fetched = await getPocket(db, alice, p.id);
    expect(fetched?.id).toBe(p.id);
    expect(fetched?.archivedAt).not.toBeNull();
  });
});

// 🔴 ข้อ 2.3 — ห้ามลบ ห้าม skip
describe('กันข้อมูลรั่วข้ามผู้ใช้', () => {
  test('Bob อ่านกระเป๋าของ Alice ไม่ได้ — getPocket คืน null', async () => {
    const alicesPocket = await createPocket(db, alice, { name: 'ส่วนตัวของ Alice', kind: 'holds_balance' });

    const leaked = await getPocket(db, bob, alicesPocket.id);
    expect(leaked).toBeNull();
  });

  test('listPockets ของ Bob ไม่มีกระเป๋าของ Alice ปนมา', async () => {
    await createPocket(db, alice, { name: 'ของ Alice', kind: 'holds_balance' });
    await createPocket(db, bob, { name: 'ของ Bob', kind: 'holds_balance' });

    const bobList = await listPockets(db, bob);
    expect(bobList.map((p) => p.name)).toEqual(['ของ Bob']);
  });
});

// แก้ได้เฉพาะ name · sortOrder · categoryId — kind/parentId ห้ามแก้
describe('updatePocket', () => {
  test('แก้ชื่อสำเร็จ อ่านกลับได้ค่าใหม่', async () => {
    const p = await createPocket(db, alice, { name: 'ชื่อเก่า', kind: 'holds_balance' });
    const updated = await updatePocket(db, alice, p.id, { name: 'ชื่อใหม่' });
    expect(updated.name).toBe('ชื่อใหม่');
    expect((await getPocket(db, alice, p.id))?.name).toBe('ชื่อใหม่');
  });

  test('แก้ sortOrder และ categoryId (ของตัวเอง) สำเร็จ', async () => {
    const cat = await seedCategory(alice, 'อาหาร');
    const p = await createPocket(db, alice, { name: 'p', kind: 'holds_balance' });
    const updated = await updatePocket(db, alice, p.id, { sortOrder: 5, categoryId: cat });
    expect(updated.sortOrder).toBe(5);
    expect(updated.categoryId).toBe(cat);
  });

  // 🔴 categoryId รั่วแบบเดียวกับ createPocket — ใส่หมวดของคนอื่นไม่ได้
  test('categoryId ของผู้ใช้อื่น → ForbiddenError', async () => {
    const bobsCat = await seedCategory(bob, 'ของบ๊อบ');
    const p = await createPocket(db, alice, { name: 'p', kind: 'holds_balance' });
    await expect(updatePocket(db, alice, p.id, { categoryId: bobsCat })).rejects.toBeInstanceOf(ForbiddenError);
  });

  // 🔴 ข้อ 2.3 — ห้ามลบ ห้าม skip
  test('ผู้ใช้ B แก้กระเป๋าของผู้ใช้ A ไม่ได้ → ForbiddenError · ชื่อไม่เปลี่ยน', async () => {
    const p = await createPocket(db, alice, { name: 'ของ Alice', kind: 'holds_balance' });
    await expect(updatePocket(db, bob, p.id, { name: 'แอบแก้' })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getPocket(db, alice, p.id))?.name).toBe('ของ Alice');
  });

  test('แก้ชื่อไม่กระทบยอด', async () => {
    const p = await createPocket(db, alice, { name: 'p', kind: 'holds_balance' });
    await insertEntry(p.id, alice, 350000);

    await updatePocket(db, alice, p.id, { name: 'เปลี่ยนชื่อ' });

    const after = await getPocket(db, alice, p.id);
    expect(after?.name).toBe('เปลี่ยนชื่อ');
    expect(after?.balanceSatang).toBe(350000);
  });
});

// archive ได้เฉพาะกระเป๋าที่ยอด rollup ทั้งกิ่ง = 0 · entry เก่ายังอยู่ ยังถูกนับใน rollup
describe('archivePocket / unarchivePocket', () => {
  test('ยอด 0 → archive สำเร็จ', async () => {
    const p = await createPocket(db, alice, { name: 'ว่าง', kind: 'holds_balance' });
    const archived = await archivePocket(db, alice, p.id);
    expect(archived.archivedAt).not.toBeNull();
  });

  test('ยอด ≠ 0 → ConflictError · ข้อความมีตัวเลขยอดจริง', async () => {
    const p = await createPocket(db, alice, { name: 'มีเงิน', kind: 'holds_balance' });
    await insertEntry(p.id, alice, 125000); // 1,250.00 บาท
    await expect(archivePocket(db, alice, p.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(archivePocket(db, alice, p.id)).rejects.toThrow('1,250.00');
  });

  // 🔴 เช็ค rollup ทั้งกิ่ง ไม่ใช่ยอดตัวเอง: แม่ว่างแต่ลูกมีเงิน → archive แม่ไม่ได้
  test('กระเป๋าแม่ที่ลูกยังมีเงิน → ConflictError', async () => {
    const parent = await createPocket(db, alice, { name: 'แม่', kind: 'holds_balance' });
    const child = await createPocket(db, alice, { name: 'ลูก', kind: 'holds_balance', parentId: parent.id });
    await insertEntry(child.id, alice, 300000);
    await expect(archivePocket(db, alice, parent.id)).rejects.toBeInstanceOf(ConflictError);
  });

  test('archive แล้ว listPockets ดีฟอลต์ไม่คืน · includeArchived=true คืน', async () => {
    const p = await createPocket(db, alice, { name: 'จะเก็บ', kind: 'holds_balance' });
    await archivePocket(db, alice, p.id);
    expect(await listPockets(db, alice)).toHaveLength(0);
    expect((await listPockets(db, alice, { includeArchived: true })).map((x) => x.id)).toEqual([p.id]);
  });

  test('archive ลูก (net 0) แล้ว rollup ของแม่ยังนับยอดเดิม · รายการไม่หาย', async () => {
    const parent = await createPocket(db, alice, { name: 'แม่', kind: 'holds_balance' });
    const child = await createPocket(db, alice, { name: 'ลูก', kind: 'holds_balance', parentId: parent.id });
    await insertEntry(parent.id, alice, 50000); // แม่มีเอง 500
    await insertEntry(child.id, alice, 100000); // ลูก +1000
    await insertEntry(child.id, alice, -100000); // ลูก −1000 → net 0 (archive ได้)

    const before = (await getPocket(db, alice, parent.id))?.rollupSatang;
    await archivePocket(db, alice, child.id);
    const after = await getPocket(db, alice, parent.id);
    expect(after?.rollupSatang).toBe(before);
    expect(after?.rollupSatang).toBe(50000); // ลูกที่ archive ยังอยู่ใน rollup (net 0)
  });

  test('unarchive แล้ว listPockets คืนกลับ', async () => {
    const p = await createPocket(db, alice, { name: 'เก็บแล้ว', kind: 'holds_balance' });
    await archivePocket(db, alice, p.id);
    await unarchivePocket(db, alice, p.id);
    expect((await listPockets(db, alice)).map((x) => x.id)).toEqual([p.id]);
  });

  // 🔴 ข้อ 2.3 — ห้ามลบ ห้าม skip
  test('ผู้ใช้ B archive กระเป๋าของ A ไม่ได้ → ForbiddenError · ยังไม่ถูก archive', async () => {
    const p = await createPocket(db, alice, { name: 'ของ Alice', kind: 'holds_balance' });
    await expect(archivePocket(db, bob, p.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getPocket(db, alice, p.id))?.archivedAt).toBeNull();
  });
});
