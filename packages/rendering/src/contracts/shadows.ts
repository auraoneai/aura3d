/**
 * C-11 — ShadowCaster depth-variant hook and shadow lookup (CONTRACTS.md). Provider: PRD 02.
 * Flag: A3D_QR_LIGHTING.
 */

import type { RenderItem } from "./renderItem";
import type { QrFlags } from "./core";
import type { ShaderFeature } from "./program";
import type { Texture } from "../Texture";
import { createRegistry } from "./core";

export interface ShadowCasterVariantKey { readonly skinning: 0 | 4 | 8; readonly skinningTexture: boolean; readonly morphTargets: boolean; readonly instanced: boolean; readonly batched: boolean; readonly alphaTest: boolean; readonly alphaHash: boolean; readonly doubleSided: boolean; readonly features: Readonly<Record<string, string | number | boolean>>; }

/**
 * PR 0a stub: returns a key with only `instanced` and `doubleSided` filled,
 * matching today's depth shader (ShaderLibraryCore.ts:784-806). Registered
 * depth features are stored and applied once PRD 02's DepthPass consumes them.
 */
export function resolveShadowCasterVariant(item: RenderItem, _flags: QrFlags): ShadowCasterVariantKey {
  return {
    skinning: 0,
    skinningTexture: false,
    morphTargets: false,
    instanced: item.instanceTransforms !== undefined || item.instanceAttributes !== undefined,
    batched: false,
    alphaTest: false,
    alphaHash: false,
    doubleSided: false,
    features: {}
  };
}

export function shadowCasterVariantId(key: ShadowCasterVariantKey): string {
  const extra = Object.keys(key.features)
    .sort()
    .map((name) => `${name}=${String(key.features[name])}`)
    .join(",");
  return [
    `sk${key.skinning}`,
    key.skinningTexture ? "skt" : "",
    key.morphTargets ? "m" : "",
    key.instanced ? "i" : "",
    key.batched ? "b" : "",
    key.alphaTest ? "at" : "",
    key.alphaHash ? "ah" : "",
    key.doubleSided ? "ds" : "",
    extra
  ].filter((part) => part.length > 0).join("|");
}

/** Depth-pass feature: same shape as C-02 ShaderFeature but applied to pass "depth" | "distance". */
export interface DepthVariantFeature extends ShaderFeature { readonly passes: readonly ("depth" | "distance" | "velocity")[]; }

const depthVariantFeatures = createRegistry<DepthVariantFeature>("depthVariantFeatures");

export function registerDepthVariantFeature(feature: DepthVariantFeature): () => void {
  return depthVariantFeatures.register(feature);
}

/**
 * @internal Stock lane registration bridge. The callback is the lane's own
 * synchronous registration, not an application eligibility callback. Snapshot
 * only objects actually added by that call, without selecting or binding them.
 */
const stockDepthFeatures = new WeakMap<DepthVariantFeature, {
  readonly descriptors: PropertyDescriptorMap;
  readonly arrays: ReadonlyMap<string, readonly unknown[]>;
}>();

export function withStockDepthRegistration<T>(register: () => T): T {
  const before = new Set(depthVariantFeatures.all());
  const result = register();
  for (const feature of depthVariantFeatures.all()) {
    if (before.has(feature)) continue;
    const descriptors = Object.getOwnPropertyDescriptors(feature);
    const arrays = new Map<string, readonly unknown[]>();
    for (const key of ["passes", "chunks", "hooks"] as const) {
      const value = descriptors[key]?.value;
      if (Array.isArray(value)) arrays.set(key, [...value]);
    }
    stockDepthFeatures.set(feature, { descriptors, arrays });
  }
  return result;
}

export function isStockDepthVariantFeature(feature: DepthVariantFeature): boolean {
  const snapshot = stockDepthFeatures.get(feature);
  if (!snapshot || Object.getPrototypeOf(feature) !== Object.prototype) return false;
  const current = Object.getOwnPropertyDescriptors(feature);
  const keys = Reflect.ownKeys(snapshot.descriptors);
  if (Reflect.ownKeys(current).length !== keys.length) return false;
  for (const key of keys) {
    const a = Reflect.get(current, key) as PropertyDescriptor | undefined;
    const b = Reflect.get(snapshot.descriptors, key) as PropertyDescriptor | undefined;
    if (!a || !b || a.value !== b.value || a.get !== undefined || a.set !== undefined ||
        a.writable !== b.writable || a.configurable !== b.configurable || a.enumerable !== b.enumerable) return false;
  }
  for (const [key, expected] of snapshot.arrays) {
    const actual = current[key]?.value;
    if (!Array.isArray(actual) || Object.getPrototypeOf(actual) !== Array.prototype ||
        actual.length !== expected.length || Reflect.ownKeys(actual).length !== expected.length + 1 ||
        !expected.every((value, index) => Object.getOwnPropertyDescriptor(actual, index)?.value === value)) return false;
  }
  return true;
}

/** Depth-variant features active under `flags`, in (order, id) order (#751, 02-DEPTH). */
export function depthVariantFeaturesFor(flags: QrFlags): readonly DepthVariantFeature[] {
  return depthVariantFeatures.active(flags);
}

export interface ShadowFrameUniforms {
  readonly cascadeTexture: Texture | null; readonly cascadeMatrices: Float32Array; readonly cascadeSplits: Float32Array; readonly cascadeTexelWorld: Float32Array;
  readonly atlasTexture: Texture | null; readonly localShadowData: Float32Array; readonly perLightShadowIndex: Int32Array;
}
/** Published on the C-01 blackboard under "prd02.shadowFrameUniforms". */
export const SHADOW_BLACKBOARD_KEY: "prd02.shadowFrameUniforms" = "prd02.shadowFrameUniforms";
/** GLSL (chunk "a3d_prd02_shadow_lookup"): float a3dSunShadowAt(vec3 worldPos); usable in vertex and fragment stages of non-forward passes. */
export const SHADOW_LOOKUP_CHUNK: "a3d_prd02_shadow_lookup" = "a3d_prd02_shadow_lookup";
export interface SkinnedBoundsProvider { worldBounds(item: RenderItem): Float32Array | null; } // PRD 06 joint AABB (C-18)

const skinnedBoundsProviders = new Set<SkinnedBoundsProvider>();

export function registerSkinnedBoundsProvider(p: SkinnedBoundsProvider): void {
  skinnedBoundsProviders.add(p);
}

/** First provider able to produce bounds wins; null when none is registered or all decline. */
export function skinnedWorldBounds(item: RenderItem): Float32Array | null {
  for (const provider of skinnedBoundsProviders) {
    const bounds = provider.worldBounds(item);
    if (bounds) return bounds;
  }
  return null;
}
