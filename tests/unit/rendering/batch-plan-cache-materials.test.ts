import { describe, expect, it } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Material } from "../../../packages/rendering/src/Material";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { DEFAULT_PBR_SHADER_NAME } from "../../../packages/rendering/src/ShaderLibraryCore";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { BatchPlanCache, applyRendererOwnedStaticBatching, disposeBatchPlanCacheFor } from "../../../packages/rendering/src/renderer/CullingBatching";

const flags = createTrustedQrFlags({});
const options = { flags, multiDraw: false };

function ownedMaterial(item: { readonly material?: Material | MaterialInstance }): Material {
  if (!(item.material instanceof Material)) throw new Error("Expected a synthesized batch material");
  return item.material;
}

function packedTexture(item: RenderItem): Texture | undefined {
  return (item as RenderItem & { readonly multiDraw?: { readonly drawData?: Texture } }).multiDraw?.drawData;
}

describe("static batch plan material snapshots", () => {
  it("replans instance overrides through the renderer-owned batching entry point", () => {
    const geometry = Geometry.litTriangle();
    const base = new PBRMaterial({ roughness: 0.25 });
    const first = new MaterialInstance(base);
    const second = new MaterialInstance(base);
    const items = [{ geometry, material: first }, { geometry, material: second }];
    const owner = {};
    const source = { staticBatching: true };
    const enabled = createTrustedQrFlags({ A3D_QR_TIERS_BATCHING: true });
    try {
      const initial = applyRendererOwnedStaticBatching(source, items, owner, enabled);
      expect(initial).toHaveLength(1);
      const oldMaterial = ownedMaterial(initial[0]!);
      second.setOverride("u_roughness", 0.75);
      const split = applyRendererOwnedStaticBatching(source, items, owner, enabled);
      expect(split).toEqual(items);
      expect(split[0]).toBe(items[0]);
      expect(split[1]).toBe(items[1]);
      expect(oldMaterial.disposed).toBe(true);
      second.clearOverride("u_roughness");
      const rejoined = applyRendererOwnedStaticBatching(source, items, owner, enabled);
      expect(rejoined).toHaveLength(1);
      const finalMaterial = ownedMaterial(rejoined[0]!);
      expect(finalMaterial.getParameter("u_roughness")).toBe(0.25);
      disposeBatchPlanCacheFor(owner);
      expect(finalMaterial.disposed).toBe(true);
      expect(base.disposed).toBe(false);
    } finally {
      disposeBatchPlanCacheFor(owner);
      geometry.dispose();
      base.dispose();
    }
  });

  it("splits and rejoins on instance overrides without disposing caller resources or another cache's plan", () => {
    const geometry = Geometry.litTriangle();
    const base = new PBRMaterial({ roughness: 0.25 });
    const first = new MaterialInstance(base);
    const second = new MaterialInstance(base);
    const items = [{ geometry, material: first }, { geometry, material: second }];
    const cache = new BatchPlanCache();
    const otherCache = new BatchPlanCache();
    try {
      const joined = cache.apply(items, options);
      const otherJoined = otherCache.apply(items, options);
      expect(joined).toHaveLength(1);
      expect(otherJoined).toHaveLength(1);
      const oldMaterial = ownedMaterial(joined[0]!);
      const otherMaterial = ownedMaterial(otherJoined[0]!);
      expect(oldMaterial).not.toBe(base);
      expect(otherMaterial).not.toBe(oldMaterial);
      expect(oldMaterial.getParameter("u_roughness")).toBe(0.25);
      expect(cache.apply(items, options)).toBe(joined);
      expect(cache.planVersion).toBe(1);

      second.setOverride("u_roughness", 0.75);
      const split = cache.apply(items, options);
      expect(split).toEqual(items);
      expect(split[0]).toBe(items[0]);
      expect(split[1]).toBe(items[1]);
      expect(cache.planVersion).toBe(2);
      expect(oldMaterial.disposed).toBe(true);
      expect(otherMaterial.disposed).toBe(false);
      expect(base.disposed).toBe(false);
      expect(second.getParameter("u_roughness")).toBe(0.75);

      first.setOverride("u_roughness", 0.75);
      const rejoined = cache.apply(items, options);
      expect(rejoined).toHaveLength(1);
      const replacement = ownedMaterial(rejoined[0]!);
      expect(replacement.getParameter("u_roughness")).toBe(0.75);
      expect(cache.planVersion).toBe(3);
      expect(otherMaterial.disposed).toBe(false);

      second.clearOverride("u_roughness");
      expect(cache.apply(items, options)).toEqual(items);
      expect(replacement.disposed).toBe(true);
      expect(cache.planVersion).toBe(4);
      first.clearOverride("u_roughness");
      const restored = cache.apply(items, options);
      expect(restored).toHaveLength(1);
      expect(ownedMaterial(restored[0]!).getParameter("u_roughness")).toBe(0.25);
      expect(cache.planVersion).toBe(5);

      // A separate cache owns its synthesized resource until it is rebuilt or disposed.
      cache.dispose();
      cache.dispose();
      expect(ownedMaterial(restored[0]!).disposed).toBe(true);
      expect(otherMaterial.disposed).toBe(false);
      expect(base.disposed).toBe(false);
      expect(geometry.getVertexBuffer(0)).toBe(geometry.vertexBuffer);
      otherCache.dispose();
      expect(otherMaterial.disposed).toBe(true);
      expect(base.disposed).toBe(false);
    } finally {
      cache.dispose();
      otherCache.dispose();
      geometry.dispose();
      base.dispose();
    }
  });

  it("rebuilds on color and emissive overrides and keeps the updated values", () => {
    const geometry = Geometry.litTriangle();
    const base = new PBRMaterial({ emissiveColor: [0.1, 0.2, 0.3] });
    const first = new MaterialInstance(base);
    const second = new MaterialInstance(base);
    const items = [{ geometry, material: first }, { geometry, material: second }];
    const cache = new BatchPlanCache();
    try {
      const initial = cache.apply(items, options);
      const firstBatch = ownedMaterial(initial[0]!);
      expect(initial).toHaveLength(1);
      expect(firstBatch.getParameter("u_emissiveColor")).toEqual([0.1, 0.2, 0.3]);

      second.setOverride("u_baseColor", [0.2, 0.4, 0.6, 1]);
      const colored = cache.apply(items, options);
      expect(cache.planVersion).toBe(2);
      expect(firstBatch.disposed).toBe(true);
      expect(colored).toHaveLength(1);
      expect(Array.from(colored[0]!.instanceColors!)).toEqual(Array.from(new Float32Array([1, 1, 1, 1, 0.2, 0.4, 0.6, 1])));
      expect(cache.apply(items, options)).toBe(colored);
      expect(cache.planVersion).toBe(2);

      second.setOverride("u_emissiveColor", [0.9, 0.1, 0.1]);
      expect(cache.apply(items, options)).toEqual(items);
      expect(cache.planVersion).toBe(3);
      first.setOverride("u_emissiveColor", [0.9, 0.1, 0.1]);
      const rejoined = cache.apply(items, options);
      expect(rejoined).toHaveLength(1);
      expect(ownedMaterial(rejoined[0]!).getParameter("u_emissiveColor")).toEqual([0.9, 0.1, 0.1]);
      expect(cache.planVersion).toBe(4);
      second.clearOverride("u_baseColor");
      const restoredColor = cache.apply(items, options);
      expect(cache.planVersion).toBe(5);
      expect(Array.from(restoredColor[0]!.instanceColors!)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    } finally {
      cache.dispose();
      geometry.dispose();
      base.dispose();
    }
  });

  it("uses effective values when a shared base changes beneath an override", () => {
    const geometry = Geometry.litTriangle();
    const base = new PBRMaterial({ roughness: 0.25 });
    const first = new MaterialInstance(base);
    const second = new MaterialInstance(base);
    first.setOverride("u_roughness", 0.25);
    const items = [{ geometry, material: first }, { geometry, material: second }];
    const cache = new BatchPlanCache();
    try {
      const initial = cache.apply(items, options);
      expect(initial).toHaveLength(1);
      const oldMaterial = ownedMaterial(initial[0]!);
      base.setParameter("u_roughness", 0.75);
      expect(cache.apply(items, options)).toEqual(items);
      expect(cache.planVersion).toBe(2);
      expect(oldMaterial.disposed).toBe(true);
      expect(first.getParameter("u_roughness")).toBe(0.25);
      expect(second.getParameter("u_roughness")).toBe(0.75);
      base.setParameter("u_roughness", 0.25);
      const rejoined = cache.apply(items, options);
      expect(rejoined).toHaveLength(1);
      expect(ownedMaterial(rejoined[0]!).getParameter("u_roughness")).toBe(0.25);
      expect(cache.planVersion).toBe(3);
    } finally {
      cache.dispose();
      geometry.dispose();
      base.dispose();
    }
  });

  it("invalidates for nested render state and texture binding edits without a material revision", () => {
    const geometry = Geometry.litTriangle();
    const colorWrite: [boolean, boolean, boolean, boolean] = [true, true, true, true];
    const base = new PBRMaterial({ renderState: { colorWrite } });
    const binding = new TextureBinding({ name: "u_environmentMapTexture", transform: { offset: [0, 0] } });
    base.setParameter("u_environmentMapTexture", binding);
    const items = [{ geometry, material: base }, { geometry, material: base }];
    const cache = new BatchPlanCache();
    try {
      const revision = base.getRevision();
      const initial = cache.apply(items, options);
      expect(initial).toHaveLength(1);
      const oldMaterial = ownedMaterial(initial[0]!);
      (binding.offset as [number, number])[0] = 0.25;
      expect(base.getRevision()).toBe(revision);
      const transformed = cache.apply(items, options);
      expect(cache.planVersion).toBe(2);
      expect(oldMaterial.disposed).toBe(true);
      const transformedMaterial = ownedMaterial(transformed[0]!);
      expect(transformedMaterial.getParameter("u_environmentMapTexture")).toBe(binding);
      expect(binding.offset).toEqual([0.25, 0]);

      colorWrite[0] = false;
      expect(base.getRevision()).toBe(revision);
      const masked = cache.apply(items, options);
      expect(cache.planVersion).toBe(3);
      expect(transformedMaterial.disposed).toBe(true);
      expect(ownedMaterial(masked[0]!).renderState.colorWrite).toEqual([false, true, true, true]);
    } finally {
      cache.dispose();
      geometry.dispose();
      base.dispose();
    }
  });

  it("tracks texture overrides, texture lifetime, and restoration of scalar batching", () => {
    const geometry = Geometry.litTriangle();
    const base = new PBRMaterial();
    const first = new MaterialInstance(base);
    const second = new MaterialInstance(base);
    const items = [{ geometry, material: first }, { geometry, material: second }];
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
    const binding = new TextureBinding({ name: "u_testTexture", texture });
    const cache = new BatchPlanCache();
    try {
      const joined = cache.apply(items, options);
      expect(joined).toHaveLength(1);
      const batchMaterial = ownedMaterial(joined[0]!);
      second.setOverride("u_testTexture", binding);
      expect(cache.apply(items, options)).toEqual(items);
      expect(batchMaterial.disposed).toBe(true);
      expect(cache.planVersion).toBe(2);
      expect(texture.disposed).toBe(false);

      texture.dispose();
      expect(cache.apply(items, options)).toEqual(items);
      expect(cache.planVersion).toBe(3);
      second.clearOverride("u_testTexture");
      expect(cache.apply(items, options)).toHaveLength(1);
      expect(cache.planVersion).toBe(4);
      expect(base.disposed).toBe(false);
    } finally {
      cache.dispose();
      geometry.dispose();
      base.dispose();
      texture.dispose();
    }
  });

  it("never returns a cached merged draw after its source material was disposed", () => {
    const geometry = Geometry.litTriangle();
    const base = new PBRMaterial();
    const instance = new MaterialInstance(base);
    const items = [{ geometry, material: instance }, { geometry, material: instance }];
    const cache = new BatchPlanCache();
    try {
      const joined = cache.apply(items, options);
      expect(joined).toHaveLength(1);
      const synthesized = ownedMaterial(joined[0]!);
      base.dispose();
      expect(() => cache.apply(items, options)).toThrow(/disposed/);
      cache.dispose();
      expect(synthesized.disposed).toBe(true);
    } finally {
      cache.dispose();
      geometry.dispose();
      base.dispose();
    }
  });

  it("retires replaced multidraw pools and textures without touching their inputs", () => {
    const firstGeometry = Geometry.litTriangle();
    const secondGeometry = Geometry.litTriangle();
    secondGeometry.vertexBuffer.setAttribute(0, "position", [-0.75, -0.5, 0]);
    const base = new PBRMaterial();
    const first = new MaterialInstance(base);
    const second = new MaterialInstance(base);
    const items = [{ geometry: firstGeometry, material: first }, { geometry: secondGeometry, material: second }];
    const cache = new BatchPlanCache();
    const multiDrawOptions = { flags, instancing: false, multiDrawAvailable: true };
    try {
      const initial = cache.apply(items, multiDrawOptions);
      expect(cache.lastReport.multiDrawBatches).toBe(1);
      expect(initial).toHaveLength(2);
      const oldGeometry = initial[0]!.geometry;
      const oldTexture = packedTexture(initial[0]!);
      expect(oldTexture).toBeDefined();
      expect(oldTexture!.disposed).toBe(false);
      expect(oldGeometry).not.toBe(firstGeometry);

      second.setOverride("u_roughness", 0.75);
      const next = cache.apply(items, multiDrawOptions);
      expect(cache.planVersion).toBe(2);
      expect(cache.lastReport.multiDrawBatches).toBe(1);
      expect(oldTexture!.disposed).toBe(true);
      expect(() => oldGeometry.getVertexBuffer(0)).toThrow(/disposed/i);
      const nextTexture = packedTexture(next[0]!);
      expect(nextTexture).toBeDefined();
      expect(nextTexture).not.toBe(oldTexture);
      cache.dispose();
      expect(nextTexture!.disposed).toBe(true);
      expect(base.disposed).toBe(false);
      expect(firstGeometry.getVertexBuffer(0)).toBe(firstGeometry.vertexBuffer);
      expect(secondGeometry.getVertexBuffer(0)).toBe(secondGeometry.vertexBuffer);
    } finally {
      cache.dispose();
      firstGeometry.dispose();
      secondGeometry.dispose();
      base.dispose();
    }
  });

  it("distinguishes NaN, infinities, and signed zero in effective values", () => {
    const geometry = Geometry.litTriangle();
    const base = new PBRMaterial();
    const instance = new MaterialInstance(base);
    const items = [{ geometry, material: instance }, { geometry, material: instance }];
    const cache = new BatchPlanCache();
    try {
      const values = [NaN, Infinity, -Infinity, -0, 0];
      values.forEach((value, index) => {
        instance.setOverride("u_roughness", value);
        const result = cache.apply(items, options);
        expect(result).toHaveLength(1);
        expect(Object.is(ownedMaterial(result[0]!).getParameter("u_roughness"), value)).toBe(true);
        expect(cache.planVersion).toBe(index + 1);
        expect(cache.apply(items, options)).toBe(result);
      });
    } finally {
      cache.dispose();
      geometry.dispose();
      base.dispose();
    }
  });

  it("refreshes a cached batch using the same color fallback and validation as planning", () => {
    const geometry = Geometry.litTriangle();
    const first = new Material({ shaderKey: DEFAULT_PBR_SHADER_NAME, parameters: { baseColor: [0.2, 0.4, 0.6] } });
    const second = new Material({ shaderKey: DEFAULT_PBR_SHADER_NAME, parameters: { u_baseColor: [0.3, 0.7] } });
    const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const items = [{ geometry, material: first, modelMatrix: matrix }, { geometry, material: second }];
    const cache = new BatchPlanCache();
    try {
      const joined = cache.apply(items, options);
      expect(joined).toHaveLength(1);
      const colors = Array.from(new Float32Array([0.2, 0.4, 0.6, 1, 1, 1, 1, 1]));
      expect(Array.from(joined[0]!.instanceColors!)).toEqual(colors);
      matrix[12] = 9;
      expect(cache.apply(items, options)).toBe(joined);
      expect(cache.planVersion).toBe(1);
      expect(Array.from(joined[0]!.instanceColors!)).toEqual(colors);
      expect(joined[0]!.instanceTransforms![12]).toBe(9);
    } finally {
      cache.dispose();
      geometry.dispose();
      first.dispose();
      second.dispose();
    }
  });

  it("distinguishes an unlimited per-draw cap from the default cap", () => {
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const items = Array.from({ length: 65 }, () => ({ geometry, material }));
    const cache = new BatchPlanCache();
    try {
      const defaultCap = cache.apply(items, options);
      expect(defaultCap.map(item => item.instanceTransforms!.length / 16)).toEqual([64, 1]);
      const oldMaterial = ownedMaterial(defaultCap[0]!);
      expect(() => cache.apply(items, { ...options, maxInstancesPerDraw: NaN })).toThrow(/maxInstancesPerDraw/);
      expect(cache.apply(items, options)).toBe(defaultCap);
      expect(cache.planVersion).toBe(1);
      expect(oldMaterial.disposed).toBe(false);
      const unlimited = cache.apply(items, { ...options, maxInstancesPerDraw: Infinity });
      expect(unlimited.map(item => item.instanceTransforms!.length / 16)).toEqual([65]);
      expect(cache.planVersion).toBe(2);
      expect(oldMaterial.disposed).toBe(true);
      const restored = cache.apply(items, options);
      expect(restored.map(item => item.instanceTransforms!.length / 16)).toEqual([64, 1]);
      expect(cache.planVersion).toBe(3);
    } finally {
      cache.dispose();
      geometry.dispose();
      material.dispose();
    }
  });
});
