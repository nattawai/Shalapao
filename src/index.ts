import { Hono } from 'hono';

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: string;
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LIFF_ID: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/health', (c) =>
  c.json({ ok: true, env: c.env.APP_ENV, at: new Date().toISOString() })
);

// ตรวจว่าต่อ D1 ติดจริง — ใช้ยืนยันว่า migration รันแล้ว
app.get('/health/db', async (c) => {
  const r = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name"
  ).all<{ name: string }>();
  return c.json({ ok: true, objects: r.results.map((x) => x.name) });
});

// API ทั้งหมดอยู่ใต้ /api — routes/ จะมาต่อที่นี่
// app.route('/api/pockets', pocketRoutes);
// app.route('/api/entries', entryRoutes);
// app.post('/line/webhook', lineWebhook);   // v3

// ที่เหลือส่งให้หน้าเว็บ LIFF (static assets จาก dist/web)
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
