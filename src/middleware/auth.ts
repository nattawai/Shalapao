import type { MiddlewareHandler } from 'hono';
import type { Env } from '../config';
import { AuthError, authenticate, type VerifyIdToken } from '../services/auth.service';

export type AuthVariables = { userId: string };
export type AuthEnv = { Bindings: Env; Variables: AuthVariables };

export type AuthMiddlewareDeps = {
  verifyIdToken: VerifyIdToken;
  upsertUser: (db: D1Database, input: { lineUserId: string; displayName: string }) => Promise<{ id: string }>;
  getChannelId: (env: Env) => string;
};

// glue บาง ๆ: อ่าน Authorization อย่างเดียว → authenticate → ยัด userId ลง context
// ตัวตนมาจาก token ที่ LINE เซ็นแล้วทางเดียว ไม่แตะ body/query — routes อ่าน c.get('userId')
// AuthError → 401 แบบไม่บอกเหตุผล (บอก = บอกผู้โจมตีว่าเดาถูกข้อไหน) · error อื่นปล่อยเป็น 500
export function authMiddleware(deps: AuthMiddlewareDeps): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    try {
      const userId = await authenticate(
        {
          verifyIdToken: deps.verifyIdToken,
          upsertUser: (input) => deps.upsertUser(c.env.DB, input),
          channelId: deps.getChannelId(c.env)
        },
        c.req.header('Authorization')
      );
      c.set('userId', userId);
    } catch (err) {
      if (err instanceof AuthError) return c.json({ error: 'unauthorized' }, 401);
      throw err;
    }
    await next();
  };
}
