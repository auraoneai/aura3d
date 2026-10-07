/**
 * PRD 11 Phase 2 (§6.8) — real C-28 `renderTargetPoolSlot` provider.
 *
 * Postprocess chains used to call `device.createRenderTarget` per pass per
 * frame (`renderer/PostprocessExecution.ts`, four sites). This pool reuses
 * idle targets keyed by `(width, height, format, samples, depth)` so the C-28
 * `renderTargetsCreated` counter stays at zero after warm-up. Lane 03 swaps
 * the post-execution `createRenderTarget` calls for `acquire`/`release` and
 * calls `trim` once per frame (request Q-03-1, behind `A3D_QR_TIERS`).
 */

import type { RenderDevice, RenderTarget, RenderTargetDescriptor } from "../RenderDevice";
import type { TextureFormat } from "../Texture";
import type { RenderTargetPoolLike } from "../contracts/device";

export type RenderTargetPoolDesc = {
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
  readonly samples: 1 | 4;
  readonly depth: boolean;
};

interface PooledEntry {
  readonly target: RenderTarget;
  /** `trim` generation at which this entry last went idle. */
  idleSince: number;
}

function poolKey(desc: RenderTargetPoolDesc): string {
  return `${desc.width}x${desc.height}:${desc.format}:s${desc.samples}:d${desc.depth ? 1 : 0}`;
}

function toRenderTargetDescriptor(desc: RenderTargetPoolDesc): RenderTargetDescriptor {
  return {
    width: desc.width,
    height: desc.height,
    label: "render-target-pool",
    // The pool contract narrows format to colour formats the post chain uses.
    format: desc.format as RenderTargetDescriptor["format"],
    sampleCount: desc.samples === 4 ? 4 : undefined,
    // `true` maps to a sampleable depth texture so guarded depth passes stay GPU-side.
    depth: desc.depth ? "texture" : false
  };
}

export class RenderTargetPool implements RenderTargetPoolLike {
  private readonly idle = new Map<string, PooledEntry[]>();
  private readonly owned = new Set<RenderTarget>();
  /** `trim` generation counter — bumped once per `trim` call (one frame). */
  private generation = 0;
  private createdCount = 0;

  constructor(private readonly device: RenderDevice) {}

  acquire(desc: RenderTargetPoolDesc): RenderTarget {
    const key = poolKey(desc);
    const bucket = this.idle.get(key);
    const entry = bucket?.pop();
    if (bucket && bucket.length === 0) this.idle.delete(key);
    if (entry) return entry.target;
    const target = this.device.createRenderTarget(toRenderTargetDescriptor(desc));
    this.owned.add(target);
    this.createdCount += 1;
    return target;
  }

  release(target: RenderTarget): void {
    // Only pool targets this pool created; foreign targets are ignored, never
    // disposed — callers may hand us targets they do not own.
    if (!this.owned.has(target)) return;
    const desc = this.descFor(target);
    let bucket = this.idle.get(poolKey(desc));
    if (!bucket) {
      bucket = [];
      this.idle.set(poolKey(desc), bucket);
    }
    bucket.push({ target, idleSince: this.generation });
  }

  /** Dispose targets idle for longer than `maxIdleFrames` `trim` generations. */
  trim(maxIdleFrames: number): void {
    this.generation += 1;
    for (const [key, bucket] of this.idle) {
      const kept = bucket.filter((entry) => {
        if (this.generation - entry.idleSince <= maxIdleFrames) return true;
        entry.target.dispose();
        this.owned.delete(entry.target);
        return false;
      });
      if (kept.length === 0) this.idle.delete(key);
      else if (kept.length !== bucket.length) this.idle.set(key, kept);
    }
  }

  /** Diagnostics for tests and the `renderer.batching`/`frame` counters. */
  poolStats(): { readonly idle: number; readonly inUse: number; readonly created: number } {
    let idle = 0;
    for (const bucket of this.idle.values()) idle += bucket.length;
    return { idle, inUse: this.owned.size - idle, created: this.createdCount };
  }

  private descFor(target: RenderTarget): RenderTargetPoolDesc {
    return {
      width: target.width,
      height: target.height,
      format: target.colorTexture.format as TextureFormat,
      samples: (target.sampleCount === 4 ? 4 : 1) as 1 | 4,
      depth: Boolean(target.depthTexture)
    };
  }
}
