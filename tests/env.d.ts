/// <reference types="@cloudflare/vitest-pool-workers/types" />

// vitest-pool-workers 0.22 ถอด ProvidedEnv ทิ้ง — `env` จาก cloudflare:test เป็น Cloudflare.Env
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    TEST_MIGRATIONS: import('@cloudflare/vitest-pool-workers').D1Migration[];
  }
}
