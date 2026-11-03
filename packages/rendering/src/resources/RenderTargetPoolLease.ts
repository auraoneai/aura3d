import type { RenderTarget } from "../RenderDevice";
import type { RenderTargetPoolLike } from "../contracts/device";

/** An acquisition-specific release callback. */
export interface TargetPoolLease {
  readonly target: RenderTarget;
  release(): void;
}

type TargetDescription = Parameters<RenderTargetPoolLike["acquire"]>[0];
type LeaseCapablePool = RenderTargetPoolLike & {
  acquireLease?: (desc: TargetDescription) => TargetPoolLease;
};

/**
 * Use the provider's token when available. A legacy provider is supported by
 * an idempotent local callback, although an unrelated target-only release to
 * that provider cannot be distinguished from the current owner.
 */
export function acquireTargetPoolLease(pool: RenderTargetPoolLike, desc: TargetDescription): TargetPoolLease {
  const candidate = pool as LeaseCapablePool;
  if (typeof candidate.acquireLease === "function") return candidate.acquireLease(desc);
  const target = pool.acquire(desc);
  let released = false;
  let releasing = false;
  return {
    target,
    release(): void {
      if (released || releasing) return;
      releasing = true;
      try {
        pool.release(target);
        released = true;
      } finally {
        releasing = false;
      }
    }
  };
}
