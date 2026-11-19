/**
 * Manifest admission lock for generated assets: a `.admit.lock` directory (atomic mkdir) under the work dir, the same
 * lock tools/idol/admit.sh takes, so parallel generate runs and agents never interleave read-modify-write of
 * aura.assets.json / src/aura-assets.ts.
 */

import { mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

export interface AdmissionLockOptions {
  readonly timeoutMs?: number;
  readonly retryMs?: number;
  /** Locks older than this are treated as stale (crashed holder) and broken. Default 30 min. */
  readonly staleMs?: number;
}

export async function withAdmissionLock<T>(dir: string, operation: () => Promise<T> | T, options: AdmissionLockOptions = {}): Promise<T> {
  const lock = join(dir, ".admit.lock");
  mkdirSync(dir, { recursive: true });
  const timeout = options.timeoutMs ?? 900_000;
  const retry = options.retryMs ?? 250;
  const stale = options.staleMs ?? 30 * 60_000;
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > stale) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - started > timeout) throw new Error(`admission lock timeout: ${lock} is held (remove it if no admission is running).`);
      await new Promise((done) => setTimeout(done, retry));
    }
  }
  try {
    return await operation();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
