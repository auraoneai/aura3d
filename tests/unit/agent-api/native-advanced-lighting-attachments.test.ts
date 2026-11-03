import { describe, expect, it, vi } from "vitest";
import { Prd02LightingRuntime } from "../../../packages/engine/src/lanes/prd02";
import { StubLightingRuntime } from "../../../packages/engine/src/contracts/lighting";
import { advancedLightingSnapshot, clearAdvancedLightingScene, installAdvancedLightingConsumer, setAdvancedLightingInvalidator } from "../../../packages/engine/src/agent-api/app/advancedLightingState";
import { NativeLightProbeGrid } from "../../../packages/rendering/src/lighting/NativeLightProbeGrid";
import { VoxelIndirectLighting } from "../../../packages/rendering/src/lighting/VoxelIndirectLighting";
import { NativeLightmapBake, type NativeBakeLight } from "../../../packages/rendering/src/lighting/NativeLightBaking";

function makeGrid() {
  return new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1] });
}

function makeLightmap(lights: readonly NativeBakeLight[]) {
  const task = new NativeLightmapBake({
    atlas: { width: 2, height: 2, uvChannel: 1, gutter: 0, texelDensity: 2,
      charts: [{ x: 0, y: 0, width: 2, height: 2, triangles: [0] }] },
    mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2] },
    lights, indirect: () => [0, 1, 0]
  });
  while (task.status !== "complete") task.step(16);
  return task.createRenderData();
}

function installFixture(owner: object) {
  const invalidate = vi.fn();
  const validateIndirect = vi.fn();
  const validateLightmap = vi.fn();
  const unregister = setAdvancedLightingInvalidator(owner, invalidate);
  const uninstall = installAdvancedLightingConsumer(owner, { validateIndirect, validateLightmap });
  return { invalidate, validateIndirect, validateLightmap, unregister, uninstall };
}

describe("advanced lighting runtime attachment state", () => {
  it("fails closed through the real provider and stub without a renderer consumer", () => {
    const grid = makeGrid();
    const runtime = new Prd02LightingRuntime(undefined, {});
    const stub = new StubLightingRuntime();
    expect(() => runtime.attachIndirect({ kind: "probe-grid", grid })).toThrowError(expect.objectContaining({ code: "ADVANCED_LIGHTING_RENDER_PATH_UNAVAILABLE" }));
    expect(() => stub.attachIndirect({ kind: "probe-grid", grid })).toThrowError(expect.objectContaining({ code: "ADVANCED_LIGHTING_RENDER_PATH_UNAVAILABLE" }));
    expect(grid.revision).toBe(0);
    runtime.dispose();
    expect(grid.evaluate([0.5, 0.5, 0.5], [0, 1, 0])).toEqual([0, 0, 0]);
    grid.dispose();
  });

  it("isolates two owners sharing a grid, refreshes edits, and ignores obsolete detach handles", () => {
    const ownerA = {}, ownerB = {};
    const a = installFixture(ownerA), b = installFixture(ownerB);
    const runtimeA = new Prd02LightingRuntime(undefined, ownerA);
    const runtimeB = new Prd02LightingRuntime(undefined, ownerB);
    const grid = makeGrid();
    const old = runtimeA.attachIndirect({ kind: "probe-grid", grid }, { outside: "clamp" });
    runtimeB.attachIndirect({ kind: "probe-grid", grid });
    grid.setProbeIrradiance(0, 0, 0, [1, 0, 0]);
    expect(a.invalidate).toHaveBeenCalledTimes(2);
    expect(b.invalidate).toHaveBeenCalledTimes(2);
    const first = advancedLightingSnapshot(ownerA).indirect;
    expect(first?.kind).toBe("probe-grid");
    expect(first?.data.revision).toBe(1);
    const voxel = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [1, 1, 1] }, quality: "low", resolution: 1 });
    const detach = runtimeA.attachIndirect({ kind: "voxel", volume: voxel });
    old();
    expect(advancedLightingSnapshot(ownerA).indirect?.kind).toBe("voxel");
    grid.setProbeIrradiance(0, 0, 0, [0, 1, 0]);
    expect(a.invalidate).toHaveBeenCalledTimes(3);
    expect(b.invalidate).toHaveBeenCalledTimes(3);
    clearAdvancedLightingScene(ownerA);
    detach();
    expect(advancedLightingSnapshot(ownerA)).toEqual({ lightmaps: [] });
    expect(voxel.snapshot().rgba).toHaveLength(4);
    runtimeA.dispose();
    runtimeB.dispose();
    expect(grid.evaluate([0.5, 0.5, 0.5], [0, 1, 0])![1]).toBeCloseTo(1);
    voxel.dispose(); grid.dispose();
  });

  it("revalidates renderer capability and automatically detaches disposed resources", () => {
    const owner = {}, fixture = installFixture(owner);
    const runtime = new Prd02LightingRuntime(undefined, owner);
    const grid = makeGrid();
    runtime.attachIndirect({ kind: "probe-grid", grid });
    advancedLightingSnapshot(owner);
    expect(fixture.validateIndirect).toHaveBeenCalledTimes(2);
    fixture.uninstall();
    expect(() => advancedLightingSnapshot(owner)).toThrowError(expect.objectContaining({ code: "ADVANCED_LIGHTING_RENDER_PATH_UNAVAILABLE" }));
    const replaceConsumer = installAdvancedLightingConsumer(owner, { validateIndirect() {}, validateLightmap() {} });
    grid.dispose();
    expect(advancedLightingSnapshot(owner)).toEqual({ lightmaps: [] });
    expect(fixture.invalidate).toHaveBeenCalledTimes(2);
    replaceConsumer(); fixture.unregister(); runtime.dispose();
  });

  it("does not retain an attachment when the app cannot schedule its invalidation", () => {
    const owner = {};
    const runtime = new Prd02LightingRuntime(undefined, owner);
    const grid = makeGrid();
    installAdvancedLightingConsumer(owner, { validateIndirect() {}, validateLightmap() {} });
    setAdvancedLightingInvalidator(owner, () => { throw new Error("scheduler failed"); });
    expect(() => runtime.attachIndirect({ kind: "probe-grid", grid })).toThrow(/scheduler failed/);
    const invalidate = vi.fn();
    setAdvancedLightingInvalidator(owner, invalidate);
    expect(advancedLightingSnapshot(owner)).toEqual({ lightmaps: [] });
    grid.setProbeIrradiance(0, 0, 0, [1, 0, 0]);
    expect(invalidate).not.toHaveBeenCalled();
    runtime.dispose(); grid.dispose();
  });

  it("keeps stale host detach handles from unregistering a newer mount", () => {
    const owner = {}, runtime = new Prd02LightingRuntime(undefined, owner), grid = makeGrid();
    const invalidate = vi.fn();
    const consumer = { validateIndirect() {}, validateLightmap() {} };
    const oldInvalidator = setAdvancedLightingInvalidator(owner, invalidate);
    setAdvancedLightingInvalidator(owner, invalidate);
    const oldConsumer = installAdvancedLightingConsumer(owner, consumer);
    installAdvancedLightingConsumer(owner, consumer);
    oldInvalidator(); oldConsumer();
    runtime.attachIndirect({ kind: "probe-grid", grid });
    grid.setProbeIrradiance(0, 0, 0, [1, 0, 0]);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(advancedLightingSnapshot(owner).indirect?.data.revision).toBe(1);
    runtime.dispose(); grid.dispose();
  });

  it("removes an attached lightmap when its caller disposes the texture", () => {
    const owner = {}, fixture = installFixture(owner);
    const runtime = new Prd02LightingRuntime(undefined, owner);
    const output = makeLightmap([]);
    const detach = runtime.attachLightmap("card", output, { composition: "add-indirect" });
    output.texture.dispose();
    expect(advancedLightingSnapshot(owner)).toEqual({ lightmaps: [] });
    expect(fixture.invalidate).toHaveBeenCalledTimes(2);
    detach();
    expect(fixture.invalidate).toHaveBeenCalledTimes(2);
    runtime.dispose();
  });

  it("requires authentic bake inputs and prevents direct light from being labeled indirect", () => {
    const owner = {};
    const fixture = installFixture(owner);
    const runtime = new Prd02LightingRuntime(undefined, owner);
    const direct = makeLightmap([{ type: "ambient", color: [1, 0, 0], intensity: 1 }]);
    const indirect = makeLightmap([]);
    expect(() => runtime.attachLightmap("card", { ...direct, provenance: indirect.provenance }, { composition: "add-indirect" })).toThrow(/LIGHTMAP_CONTAINS_AUTHORED_LIGHTS/);
    const detach = runtime.attachLightmap("card", direct, { composition: "replace-diffuse" });
    expect(advancedLightingSnapshot(owner).lightmaps[0]!.lightmap.provenance.hasAuthoredLights).toBe(true);
    const other = runtime.attachLightmap("card", indirect, { composition: "add-indirect" });
    detach();
    expect(advancedLightingSnapshot(owner).lightmaps[0]!.lightmap.texture).toBe(indirect.texture);
    expect(() => runtime.attachLightmap("card", { ...indirect, uvChannel: 2 }, { composition: "add-indirect" })).toThrow(/UV channel/);
    const pixels = indirect.texture.getMipLevel(0)!.data as Float32Array;
    pixels[0] += 1;
    expect(() => advancedLightingSnapshot(owner)).toThrow(/LIGHTMAP_PROVENANCE_INVALID/);
    other(); fixture.uninstall(); fixture.unregister(); runtime.dispose();
    expect(direct.texture.disposed).toBe(false);
    expect(indirect.texture.disposed).toBe(false);
    direct.texture.dispose(); indirect.texture.dispose();
  });
});
