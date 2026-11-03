import type { DisposableResource } from "./RenderDevice";

// A resource may be deliberately tracked by more than one lifecycle. A weak
// table avoids making that shared ownership keep the resource alive by itself.
const owners = new WeakMap<DisposableResource, number>();
const retiring = new WeakSet<DisposableResource>();

/** Internal completion signal for resources whose `disposed` flag means closed
 * before their retryable cleanup finishes. Shared across module copies. */
export const resourceDisposalPending = Symbol.for("@aura3d/rendering/resource-disposal-pending");

/** Internal signal that a resource's current cleanup call is still on the stack. */
export const resourceDisposalInProgress = Symbol.for("@aura3d/rendering/resource-disposal-in-progress");

function resourceReleased(resource: DisposableResource): boolean {
  return resource.disposed
    && (resource as DisposableResource & { readonly [resourceDisposalPending]?: boolean })[resourceDisposalPending] !== true
    && !resourceDisposing(resource);
}

function resourceDisposing(resource: DisposableResource): boolean {
  return (resource as DisposableResource & { readonly [resourceDisposalInProgress]?: boolean })[resourceDisposalInProgress] === true;
}

/** Owns tracked resources until disposal. Shared resources are released by the
 * last tracking lifecycle, and each lifecycle tracks a resource at most once. */
export class ResourceLifecycle {
  private readonly resources = new Set<DisposableResource>();
  private closed = false;
  private disposing = false;

  get disposed(): boolean {
    return this.closed && !this.disposing && this.resources.size === 0;
  }

  track<T extends DisposableResource>(resource: T): T {
    if (this.closed) throw new Error("Cannot track a resource after its lifecycle is disposed.");
    if (retiring.has(resource)) throw new Error("Cannot track a resource while its disposal is in progress.");
    if (!this.resources.has(resource)) {
      this.resources.add(resource);
      owners.set(resource, (owners.get(resource) ?? 0) + 1);
    }
    return resource;
  }

  /** Release in reverse registration order, attempting every owned disposer.
   * Failed final releases remain owned for retry; successful releases are not repeated. */
  dispose(): void {
    if (this.disposed || this.disposing) return;
    this.closed = true;
    this.disposing = true;
    const errors: unknown[] = [];
    try {
      for (const resource of [...this.resources].reverse()) {
        const remaining = (owners.get(resource) ?? 1) - 1;
        if (remaining > 0) {
          owners.set(resource, remaining);
          this.resources.delete(resource);
          continue;
        }
        let released = false;
        retiring.add(resource);
        try {
          if (!resourceReleased(resource) && !resourceDisposing(resource)) {
            resource.dispose();
          }
          released = resourceReleased(resource);
          if (!released) throw new Error("Resource disposal did not complete.");
        } catch (error) {
          // A disposer can finish cleanup and then report a callback failure.
          try { released = resourceReleased(resource); } catch { /* Keep the retain without a completion receipt. */ }
          errors.push(error);
        } finally {
          if (released) {
            owners.delete(resource);
            this.resources.delete(resource);
          }
          retiring.delete(resource);
        }
      }
    } finally {
      this.disposing = false;
    }
    if (errors.length > 0) throw new AggregateError(errors, "Resource lifecycle disposal failed.");
  }

  leakCount(): number {
    return [...this.resources].filter((resource) => !resourceReleased(resource)).length;
  }
}
