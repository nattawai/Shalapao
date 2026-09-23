import { Hono } from 'hono';
import { lineLoginChannelId } from './config';
import { verifyLineIdToken } from './lib/line';
import { authMiddleware, type AuthEnv } from './middleware/auth';
import { categoryRoutes } from './routes/category.route';
import { entryRoutes, transferRoutes } from './routes/entry.route';
import { httpError } from './routes/http-error';
import { me } from './routes/me.route';
import { pocketRoutes } from './routes/pocket.route';
import { upsertUserByLineId } from './repositories/app-user.repository';

const app = new Hono<AuthEnv>();

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

// ทุก route ใต้ /api ต้องผ่าน auth ก่อน — wire ไว้ก่อนมี route จริง เพื่อให้ route
// ที่เกิดหลังจากนี้ถูกป้องกันโดยโครงสร้าง ไม่ใช่โดยการจำไปใส่เอง · userId มาจาก
// ID token ที่ LINE เซ็นแล้วทางเดียว ยัดลง c.get('userId') ให้ทุก route
app.use(
  '/api/*',
  authMiddleware({
    verifyIdToken: verifyLineIdToken,
    upsertUser: upsertUserByLineId,
    getChannelId: (env) => lineLoginChannelId(env)
  })
);

// ชั่วคราว: smoke test สำหรับ first deploy — พิสูจน์ auth ด้วย ID token จริง
// ต้องถูกแทนที่ตอนทำหน้าจอจริง ไม่ใช่ต่อยอดจากมัน
app.get('/api/me', me);

app.route('/api/pockets', pocketRoutes);
app.route('/api/categories', categoryRoutes);
app.route('/api/entries', entryRoutes);
app.route('/api/transfers', transferRoutes);

// จุดเดียวที่แปลง typed error (domain) และ ZodError → HTTP status
app.onError(httpError);

// ที่เหลือส่งให้หน้าเว็บ LIFF (static assets จาก dist/web)
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
