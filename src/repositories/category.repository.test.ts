import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, test } from 'vitest';
import { newId, nowIso } from '../domain/id';
import { createCategory, getCategory, listCategories } from './category.repository';

const db = env.DB;

async function seedUser(id: string): Promise<void> {
  await db
    .prepare('INSERT INTO app_user (id, line_user_id, display_name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, `U-${id}`, 'user', nowIso())
    .run();
}

let alice: string;
let bob: string;

beforeEach(async () => {
  alice = newId();
  bob = newId();
  await seedUser(alice);
  await seedUser(bob);
});

describe('createCategory / getCategory', () => {
  test('สร้างแล้วอ่านกลับได้', async () => {
    const c = await createCategory(db, alice, { name: 'อาหาร', icon: '🍜' });
    expect(c.name).toBe('อาหาร');
    expect(c.icon).toBe('🍜');
    expect(c.userId).toBe(alice);

    const fetched = await getCategory(db, alice, c.id);
    expect(fetched?.id).toBe(c.id);
  });

  test('ชื่อซ้ำในหมวดที่ยังใช้อยู่ → ปฏิเสธ (unique index)', async () => {
    await createCategory(db, alice, { name: 'อาหาร' });
    await expect(createCategory(db, alice, { name: 'อาหาร' })).rejects.toThrow();
  });

  test('คนละผู้ใช้ตั้งชื่อเดียวกันได้', async () => {
    await createCategory(db, alice, { name: 'อาหาร' });
    const c = await createCategory(db, bob, { name: 'อาหาร' });
    expect(c.userId).toBe(bob);
  });
});

describe('listCategories', () => {
  test('เรียงตาม sort_order แล้ว id', async () => {
    await createCategory(db, alice, { name: 'b', sortOrder: 2 });
    await createCategory(db, alice, { name: 'a', sortOrder: 1 });
    const list = await listCategories(db, alice);
    expect(list.map((c) => c.name)).toEqual(['a', 'b']);
  });

  test('ค่าเริ่มต้นไม่คืนหมวดที่ archive แล้ว · includeArchived คืนทั้งหมด', async () => {
    const live = await createCategory(db, alice, { name: 'live' });
    const gone = await createCategory(db, alice, { name: 'gone' });
    await db.prepare('UPDATE category SET archived_at = ? WHERE id = ?').bind(nowIso(), gone.id).run();

    expect((await listCategories(db, alice)).map((c) => c.id)).toEqual([live.id]);
    expect((await listCategories(db, alice, { includeArchived: true })).length).toBe(2);
  });

  // 🔴 กันข้อมูลรั่วข้ามผู้ใช้
  test('listCategories ของ Bob ไม่มีหมวดของ Alice', async () => {
    await createCategory(db, alice, { name: 'ของ Alice' });
    await createCategory(db, bob, { name: 'ของ Bob' });
    expect((await listCategories(db, bob)).map((c) => c.name)).toEqual(['ของ Bob']);
  });

  // 🔴 กันข้อมูลรั่วข้ามผู้ใช้
  test('getCategory หมวดของคนอื่น → null', async () => {
    const c = await createCategory(db, alice, { name: 'ของ Alice' });
    expect(await getCategory(db, bob, c.id)).toBeNull();
  });
});
