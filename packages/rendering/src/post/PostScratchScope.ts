import { type PostTargetKey, type PostTargetLease, PostResources } from "./PostResources";

/** Per-invocation ownership of scratch targets; tracks leases, never target identities. */
export class PostScratchScope {
  private readonly leases = new Set<PostTargetLease>();
  private closed = false;

  constructor(private readonly resources: PostResources) {}

  acquire(key: PostTargetKey): PostTargetLease {
    if (this.closed) throw new Error("POSTPROCESS_SCRATCH_SCOPE_CLOSED");
    const lease = this.resources.acquireLease(key);
    this.leases.add(lease);
    return lease;
  }

  release(lease: PostTargetLease | null | undefined): void {
    if (!lease || !this.leases.delete(lease)) return;
    lease.release();
  }

  /** Give this exact acquisition to another owner without releasing it. */
  take(lease: PostTargetLease): PostTargetLease {
    if (!this.leases.delete(lease)) throw new Error("POSTPROCESS_SCRATCH_LEASE_NOT_OWNED");
    return lease;
  }

  /** Retire every currently owned acquisition except explicitly retained handles. */
  releaseExcept(retained: readonly (PostTargetLease | null | undefined)[]): void {
    const keep = new Set(retained);
    const errors: unknown[] = [];
    for (const lease of [...this.leases]) {
      if (keep.has(lease)) continue;
      try { this.release(lease); } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Postprocess scratch release failed");
  }

  releaseAll(): void {
    if (this.closed) return;
    this.closed = true;
    const leases = [...this.leases];
    this.leases.clear();
    const errors: unknown[] = [];
    for (const lease of leases) {
      try { lease.release(); } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Postprocess scratch release failed");
  }
}
