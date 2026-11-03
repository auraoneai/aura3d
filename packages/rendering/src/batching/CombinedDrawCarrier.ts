import type { RenderItem } from "../contracts/renderItem";
import type { Texture } from "../Texture";

// This identity grants only temporary access to a shader variant. The forward
// pass must separately validate the device, producer, observers, every row,
// and the lifetime of the texture before attempting a combined submission.
const activeCarriers = new WeakSet<object>();
const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Identity-only, so proxies and public objects are never inspected. */
export function isActiveCombinedDrawCarrier(value: unknown): boolean {
  return (typeof value === "object" && value !== null || typeof value === "function") && activeCarriers.has(value);
}

/**
 * Scope a renderer-private carrier to one synchronous preparation/submission.
 * It contains no instance stream: the generated batch shader uses each row's
 * model and tint. The caller owns all admission and resource-lifetime checks.
 */
export function withCombinedDrawCarrier<T>(source: RenderItem, texture: Texture, use: (carrier: RenderItem) => T): T {
  const { instanceTransforms: _transforms, instanceColors: _colors, instanceCount: _count,
    modelViewProjectionMatrix: _mvp, ...shared } = source;
  const carrier: RenderItem = Object.freeze({
    ...shared,
    modelMatrix: IDENTITY,
    normalMatrix: IDENTITY,
    multiDraw: Object.freeze({ mode: "multi-draw", drawIndex: 0, drawData: texture })
  });
  activeCarriers.add(carrier);
  try { return use(carrier); }
  finally { activeCarriers.delete(carrier); }
}
