import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineAuraAssets, lights, material, primitives, scene as buildScene, upgradeProductionPrimitiveTextures, type AuraSceneNode } from "@aura3d/engine";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { createAuraRuntimeNodeRegistry } from "../../../../packages/engine/src/agent-api/app/runtimeNodes";
import { CompiledSceneImpl, type MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import { resolveProductionPrimitiveRuntimeState } from "../../../../packages/engine/src/agent-api/compiler/primitives";
import { resolveMountQuality } from "../../../../packages/engine/src/agent-api/compiler/renderer";
import { resetSharedProductionTextureDecodes } from "../../../../packages/engine/src/agent-api/compiler/textures";
import type { ProductionRuntimePrimitiveEntry } from "../../../../packages/engine/src/agent-api/nodes/types";

/**
 * GU47 g11 phase 10 (Bunker Zero per-floor load): a textured primitive added at runtime (`app.nodes.add`, C-37 subtree
 * path) must get its maps. The mount's upgrade pass only sweeps entries added while it is still running, so an entry
 * added after it drained kept its scalar material and read `none`. `addSubtree` now reports its new primitive entries
 * (`onPrimitiveEntriesAdded`) and the renderer runs the textured and custom-texture upgrades on them.
 */
const FLAGS = resolveQrFlags({ options: { A3D_QR_COMPILER: true } });
const assets = defineAuraAssets({ wall: { type: "texture", format: "png", url: "/wall.png", hash: "fixture" } });
const node = (builder: { toJSON(): unknown }) => builder.toJSON() as AuraSceneNode;
afterEach(() => { vi.unstubAllGlobals(); resetSharedProductionTextureDecodes(); });

function compiled() {
  const ctx = {
    renderer: undefined, assets: undefined, quality: resolveMountQuality(undefined), strict: false, flags: FLAGS,
    degrade: () => undefined, canvas: { width: 64, height: 64 } as HTMLCanvasElement,
    environmentLighting: () => ({ color: [1, 1, 1], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set<string>()
  } as unknown as MountSceneCompileContext;
  return new CompiledSceneImpl(1, null, [], new Set(), [], [], [], [], ctx, [], []);
}

describe("GU47 g11 phase 10: runtime-added textured primitives", () => {
  it("addSubtree reports the primitive entries it created, and nothing for a subtree without primitives", () => {
    const scene = compiled();
    const added: (readonly ProductionRuntimePrimitiveEntry[])[] = [];
    scene.onPrimitiveEntriesAdded = (entries) => { added.push(entries); };
    scene.addSubtree(node(primitives.box({ name: "f3 walls", material: material.pbr({ color: "#ffffff", texture: assets.wall }) }).runtime({ id: "f3-s-walls" })));
    expect(added).toHaveLength(1);
    expect(added[0]!.map((e) => e.node.name)).toEqual(["f3 walls"]);
    expect(scene.primitiveEntries).toContain(added[0]![0]);
    scene.addSubtree(node(lights.point({ name: "lamp", position: [0, 2, 0] }).runtime({ id: "lamp" })));
    expect(added).toHaveLength(1);
  });

  it("an entry added after the mount pass drained is queued (pending) only by a pass over the added entries", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    vi.stubGlobal("createImageBitmap", vi.fn());
    const scene = compiled();
    const run = (entries: readonly ProductionRuntimePrimitiveEntry[]) => upgradeProductionPrimitiveTextures(entries, () => undefined);
    await run(scene.primitiveEntries); // the mount pass: nothing to upgrade, drains at once
    let added: readonly ProductionRuntimePrimitiveEntry[] = [];
    scene.onPrimitiveEntriesAdded = (entries) => { added = entries; };
    scene.addSubtree(node(primitives.box({ name: "f3 floor", material: material.pbr({ color: "#ffffff", texture: assets.wall }) }).runtime({ id: "f3-s-floor" })));
    const resource = added[0]!.resources[0]!;
    expect(resource.textureStatus).toBe("none");
    void run(added);
    expect(resource.textureStatus).toBe("pending");
    // A second pass (the mount pass still sweeping the shared list) never queues it twice.
    void run(scene.primitiveEntries);
    expect(resource.textureStatus).toBe("pending");
  });

  it("the renderer runs the textured and custom-texture upgrades on the added entries", () => {
    const src = readFileSync("packages/engine/src/agent-api/compiler/renderer.ts", "utf8");
    const hook = src.slice(src.indexOf("onPrimitiveEntriesAdded = (added) =>"), src.indexOf("attachCompiled?.(compiledScene)"));
    expect(hook).toContain("upgradeProductionPrimitiveTextures(added,");
    expect(hook).toContain("upgradeCustomMaterialTextures(added,");
  });

  it("keeps the renderer's primitive entry list current after a removal and later addition", () => {
    const scene = compiled();
    const observed = scene.primitiveEntries;
    scene.addSubtree(node(primitives.box({ name: "first" }).runtime({ id: "first" })));
    expect(observed.map((entry) => entry.node.name)).toEqual(["first"]);
    expect(scene.removeSubtree("first")).toBe(true);
    expect(observed).toEqual([]);
    scene.addSubtree(node(primitives.box({ name: "second" }).runtime({ id: "second" })));
    expect(scene.primitiveEntries).toBe(observed);
    expect(observed.map((entry) => entry.node.name)).toEqual(["second"]);
    scene.dispose();
  });

  it("releases a removed primitive's pending decode before another primitive requests the same map", async () => {
    const respond: ((value: Response) => void)[] = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { respond.push(resolve); }));
    const bitmaps: { width: number; height: number; close: ReturnType<typeof vi.fn> }[] = [];
    const warnings: string[] = [];
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => {
      const bitmap = { width: 1, height: 1, close: vi.fn() };
      bitmaps.push(bitmap);
      return bitmap;
    }));
    const scene = compiled();
    scene.onPrimitiveEntriesAdded = (entries) => { void upgradeProductionPrimitiveTextures(entries, (message) => warnings.push(message)); };
    const box = (id: string) => node(primitives.box({ name: id, material: material.pbr({ texture: assets.wall }) }).runtime({ id }));
    scene.addSubtree(box("removed"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(scene.removeSubtree("removed")).toBe(true);
    scene.addSubtree(box("replacement"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    respond[0]!(new Response(new Uint8Array([1])));
    respond[1]!(new Response(new Uint8Array([2])));
    await vi.waitFor(() => expect(scene.primitiveEntries[0]!.resources[0]!.textureStatus).toBe("textured"));
    await vi.waitFor(() => expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1));
    expect(warnings).toEqual([]);
    scene.dispose();
    expect(bitmaps[1]!.close).toHaveBeenCalledTimes(1);
  });

  it("keeps a shared pending decode alive when only one of its primitive holders is removed", async () => {
    let respond: (value: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; }));
    const bitmap = { width: 1, height: 1, close: vi.fn() };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    const scene = compiled();
    scene.onPrimitiveEntriesAdded = (entries) => { void upgradeProductionPrimitiveTextures(entries, () => undefined); };
    const box = (id: string) => node(primitives.box({ name: id, material: material.pbr({ texture: assets.wall }) }).runtime({ id }));
    scene.addSubtree(box("first"));
    scene.addSubtree(box("second"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(scene.removeSubtree("first")).toBe(true);
    respond(new Response(new Uint8Array([1])));
    await vi.waitFor(() => expect(scene.primitiveEntries[0]!.resources[0]!.textureStatus).toBe("textured"));
    expect(bitmap.close).not.toHaveBeenCalled();
    scene.dispose();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("upgrades and hides a primitive added through the runtime node registry", async () => {
    const bitmap = { width: 1, height: 1, close: vi.fn() };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    const snapshot = buildScene().toJSON();
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const scene = compiled();
    const upgrades: Promise<void>[] = [];
    scene.onPrimitiveEntriesAdded = (entries) => { upgrades.push(upgradeProductionPrimitiveTextures(entries, () => undefined)); };
    registry.configure({ flags: FLAGS, getScene: () => snapshot, setScene: () => undefined });
    registry.attachCompiled(scene);
    const handle = registry.add(primitives.box({ name: "next floor", material: material.pbr({ texture: assets.wall }) }).runtime({ id: "next" }));
    handle.setVisible(false);
    expect(scene.primitiveEntries[0]!.resources[0]!.textureStatus).toBe("pending");
    await Promise.all(upgrades);
    expect(scene.primitiveEntries[0]!.resources[0]!.textureStatus).toBe("textured");
    expect(resolveProductionPrimitiveRuntimeState(scene.primitiveEntries[0]!, registry).visible).toBe(false);
    expect(registry.remove("next")).toBe(true);
    expect(scene.primitiveEntries).toHaveLength(0);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    scene.dispose();
  });
});
