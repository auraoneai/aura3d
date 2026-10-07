/**
 * PRD-03 Phase 2 — v2 post-graph render-target pool.
 *
 * A thin cache in front of the C-28 `renderTargetPoolSlot` pool (whose PR 0a
 * stub allocates on every acquire). Entries are keyed by
 * `(width, height, format, samples, depth)`; `releaseAll()` returns live
 * targets to the free list so the next frame reuses them instead of
 * reallocating. `resize(width, height)` releases every pooled entry whose key
 * no longer matches the new render size, so a canvas resize cannot serve a
 * stale target back.
 *
 * The pool never owns GPU resources beyond the device lifetime: `dispose()`
 * releases everything and `trim(frames)` forwards to the underlying pool so
 * idle capacity still shrinks once C-28 is real.
 */

import type { RenderDevice, RenderTarget } from "../RenderDevice";
import type { RenderTargetPoolLike } from "../contracts/device";
import { renderTargetPoolSlot } from "../contracts/device";
import type { QrFlags } from "../contracts/core";

export interface PostTargetKey {
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly samples: 1 | 4;
  readonly depth: boolean;
}

function keyOf(key: PostTargetKey): string {
  return `${key.width}x${key.height}:${key.format}:${key.samples}:${key.depth ? 1 : 0}`;
}

export class PostResources {
  private readonly free = new Map<string, RenderTarget[]>();
  private readonly live = new Set<RenderTarget>();
  private allocations = 0;

  constructor(
    private readonly device: RenderDevice,
    private readonly flags: QrFlags
  ) {}

  private pool(): RenderTargetPoolLike {
    return renderTargetPoolSlot.get(this.flags)(this.device);
  }

  /** Total underlying allocations — the leak-detection counter tests assert on. */
  get allocationCount(): number {
    return this.allocations;
  }

  acquire(key: PostTargetKey): RenderTarget {
    const id = keyOf(key);
    const cached = this.free.get(id);
    const fromCache = Boolean(cached && cached.length > 0);
    const target = fromCache
      ? cached!.pop()!
      : this.pool().acquire({
          width: key.width,
          height: key.height,
          format: key.format as never,
          samples: key.samples,
          depth: key.depth
        });
    if (!fromCache) this.allocations += 1;
    this.live.add(target);
    return target;
  }

  /** Release one live target back to the free list (safe to call per frame). */
  release(target: RenderTarget): void {
    if (!this.live.delete(target)) return;
    const key = this.keyForTarget(target);
    const list = this.free.get(key) ?? [];
    list.push(target);
    this.free.set(key, list);
  }

  /** End-of-frame: everything acquired this frame returns to the free list. */
  releaseAll(): void {
    for (const target of [...this.live]) {
      this.release(target);
    }
  }

  /**
   * Releases every pooled entry whose (w,h) does not match the new render
   * size — a resize can never hand back a stale target.
   */
  resize(width: number, height: number): void {
    for (const [key, list] of this.free) {
      const [w, h] = key.split(":")[0]!.split("x").map(Number);
      if (w !== width || h !== height) {
        for (const target of list) this.pool().release(target);
        this.free.delete(key);
      }
    }
    for (const target of [...this.live]) {
      const [w, h] = this.keyForTarget(target).split(":")[0]!.split("x").map(Number);
      if (w !== width || h !== height) {
        this.live.delete(target);
        this.pool().release(target);
      }
    }
  }

  trim(maxIdleFrames: number): void {
    this.pool().trim(maxIdleFrames);
  }

  dispose(): void {
    const pool = this.pool();
    for (const list of this.free.values()) {
      for (const target of list) pool.release(target);
    }
    this.free.clear();
    for (const target of this.live) pool.release(target);
    this.live.clear();
  }

  private keyForTarget(target: RenderTarget): string {
    const samples = ((target as { sampleCount?: number }).sampleCount ?? 1) as 1 | 4;
    const hasDepth = (target as { depthTexture?: unknown }).depthTexture !== undefined
      || (target as { depthTextureHandle?: unknown }).depthTextureHandle != null
      || (target as { depthHandle?: unknown }).depthHandle != null;
    return keyOf({
      width: target.width,
      height: target.height,
      format: target.colorTexture.format,
      samples,
      depth: hasDepth
    });
  }
}
