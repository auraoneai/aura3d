/**
 * PRD 11 Phase 5 — real C-29 `ResourceRegistry` (`resourceRegistrySlot`
 * provider). Records registered GPU resources' creation descriptors plus
 * optional CPU-side source handles (§6.9):
 *
 * - `rebuild(device)` re-creates every registered resource eagerly. Entries
 *   whose CPU source was released under the memory policy are refetched
 *   first (`refetch`) and counted in `refetched`.
 * - `setRetentionPolicy(retain)` implements the §6.9 item-3 rule the
 *   `RetentionPolicy` helper resolves per tier: when `retain` is false,
 *   entries that did not opt into `retainForRestore` release their decoded
 *   sources (`releaseSource`) and must `refetch` on the next rebuild.
 *
 * The contract descriptor (`{kind, rebuild}`) remains valid input; the extra
 * fields are additive and optional.
 */

import type { RenderDevice } from "../RenderDevice";
import type { ResourceRegistryLike } from "../contracts/rendererFactory";

export interface ResourceDescriptor {
  readonly kind: string;
  /** Re-create the GPU resource from the recorded descriptor/CPU source. */
  readonly rebuild: () => Promise<void> | void;
  /** Re-fetch a released CPU source before rebuild (network/decoded data). */
  readonly refetch?: () => Promise<void> | void;
  /** Drop the CPU-side source (post-upload memory policy). */
  readonly releaseSource?: () => void;
  /** True keeps the CPU source even under the release policy (High/Ultra). */
  readonly retainForRestore?: boolean;
}

interface RegistryEntry {
  readonly descriptor: ResourceDescriptor;
  /** Released under the memory policy; refetch is required before rebuild. */
  sourceReleased: boolean;
}

export class ResourceRegistry implements ResourceRegistryLike {
  private readonly entries = new Map<object, RegistryEntry>();
  private retain = true;

  register<T extends object>(
    handle: T,
    descriptor: ResourceDescriptor | { readonly kind: string; readonly rebuild: () => Promise<void> | void }
  ): T {
    const full = descriptor as ResourceDescriptor;
    const entry: RegistryEntry = { descriptor: full, sourceReleased: false };
    this.entries.set(handle, entry);
    if (!this.retain && !full.retainForRestore && full.releaseSource) {
      try {
        full.releaseSource();
        entry.sourceReleased = true;
      } catch {
        // Release failures are non-fatal: the source simply stays retained.
      }
    }
    return handle;
  }

  unregister(handle: object): void {
    this.entries.delete(handle);
  }

  /** §6.9 memory policy. `false` releases every non-retained CPU source now. */
  setRetentionPolicy(retain: boolean): void {
    if (this.retain === retain) return;
    this.retain = retain;
    if (retain) return;
    for (const entry of this.entries.values()) {
      const { descriptor } = entry;
      if (!descriptor.retainForRestore && descriptor.releaseSource && !entry.sourceReleased) {
        try {
          descriptor.releaseSource();
          entry.sourceReleased = true;
        } catch {
          // Non-fatal: the entry stays usable, just heavier.
        }
      }
    }
  }

  get size(): number {
    return this.entries.size;
  }

  async rebuild(_device: RenderDevice): Promise<{ readonly rebuilt: number; readonly refetched: number; readonly failed: readonly string[] }> {
    let rebuilt = 0;
    let refetched = 0;
    const failed: string[] = [];
    for (const entry of this.entries.values()) {
      const { descriptor } = entry;
      try {
        if (entry.sourceReleased && descriptor.refetch) {
          await descriptor.refetch();
          entry.sourceReleased = false;
          refetched += 1;
        }
        await descriptor.rebuild();
        rebuilt += 1;
      } catch {
        failed.push(descriptor.kind);
      }
    }
    return { rebuilt, refetched, failed };
  }
}

/**
 * Lane-11 shared registry instance. `lanes/prd11.ts` provides it through
 * `resourceRegistrySlot`, and lane-owned resources (render-target pool,
 * DrawDataTexture, BatchedGeometryPool arenas) self-register against it so
 * `installDeviceRestoreRebuild` recreates them on context restore.
 */
let shared: ResourceRegistry | null = null;

export function sharedResourceRegistry(): ResourceRegistry {
  if (!shared) shared = new ResourceRegistry();
  return shared;
}
