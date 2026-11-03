import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineAuraAssets, lights, material, primitives, scene as buildScene, type AuraSceneNode } from "@aura3d/engine";
import { upgradeProductionPrimitiveTextures } from "@aura3d/engine-runtime";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { createAuraRuntimeNodeRegistry } from "../../../../packages/engine/src/agent-api/app/runtimeNodes";
import { CompiledSceneImpl, type MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import { resolveProductionPrimitiveRuntimeState } from "../../../../packages/engine/src/agent-api/compiler/primitives";
import { resolveMountQuality } from "../../../../packages/engine/src/agent-api/compiler/renderer";
import { resetSharedProductionTextureDecodes, sharedProductionTextureDecodeStats } from "../../../../packages/engine/src/agent-api/compiler/textures";
import type { ProductionRuntimePrimitiveEntry } from "../../../../packages/engine/src/agent-api/nodes/types";

/**
 * GU47 g11 phase 10 (Bunker Zero per-floor load): a textured primitive added at runtime (`app.nodes.add`, C-37 subtree
 * path) must get its maps. The mount's upgrade pass only sweeps entries added while it is still running, so an entry
 * added after it drained kept its scalar material and read `none`. `addSubtree` now reports its new primitive entries
 * (`onPrimitiveEntriesAdded`) and the renderer runs the textured and custom-texture upgrades on them.
 */
const FLAGS = resolveQrFlags({ options: { A3D_QR_COMPILER: true } });
// Native 5.0: typed assets are verified against their declared digest, so fixtures declare the real SHA-256 of the
// bytes each fetch stub serves (`/wall.png` serves [1]; the scene maps serve their own URL text).
const sha256 = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");
const WALL_BYTES = Uint8Array.of(1);
const assets = defineAuraAssets({ wall: { type: "texture", format: "png", url: "/wall.png", hash: sha256(WALL_BYTES) } });
const node = (builder: { toJSON(): unknown }) => builder.toJSON() as AuraSceneNode;
// Native 5.0: the 4.7.x `CompiledSceneImpl.onPrimitiveEntriesAdded` field is subsumed by the mount context's
// `onPrimitiveEntriesAdded`, called once an added subtree is published. The fixture context forwards it here.
let onAdded: ((entries: readonly ProductionRuntimePrimitiveEntry[]) => void) | undefined;
afterEach(() => { onAdded = undefined; vi.unstubAllGlobals(); resetSharedProductionTextureDecodes(); });

function compiled() {
  const ctx = {
    renderer: undefined, assets: undefined, quality: resolveMountQuality(undefined), strict: false, flags: FLAGS,
    degrade: () => undefined, canvas: { width: 64, height: 64 } as HTMLCanvasElement,
    environmentLighting: () => ({ color: [1, 1, 1], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set<string>(),
    onPrimitiveEntriesAdded: (entries: readonly ProductionRuntimePrimitiveEntry[]) => onAdded?.(entries)
  } as unknown as MountSceneCompileContext;
  return new CompiledSceneImpl(1, null, [], new Set(), [], [], [], [], ctx, [], []);
}

describe("GU47 g11 phase 10: runtime-added textured primitives", () => {
  it("addSubtree reports the primitive entries it created, and nothing for a subtree without primitives", () => {
    const scene = compiled();
    const added: (readonly ProductionRuntimePrimitiveEntry[])[] = [];
    onAdded = (entries) => { added.push(entries); };
    scene.addSubtree(node(primitives.box({ name: "f3 walls", material: material.pbr({ color: "#ffffff", texture: assets.wall }) }).runtime({ id: "f3-s-walls" })));
    expect(added).toHaveLength(1);
    expect(added[0]!.map((e) => e.node.name)).toEqual(["f3 walls"]);
    expect(scene.primitiveEntries).toContain(added[0]![0]);
    scene.addSubtree(node(lights.point({ name: "lamp", position: [0, 2, 0] }).runtime({ id: "lamp" })));
    expect(added).toHaveLength(1);
  });

  it("an entry added after the mount pass drained is queued (pending) only by a pass over the added entries", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn());
    const scene = compiled();
    const run = (entries: readonly ProductionRuntimePrimitiveEntry[]) => upgradeProductionPrimitiveTextures(entries, () => undefined);
    await run(scene.primitiveEntries); // the mount pass: nothing to upgrade, drains at once
    let added: readonly ProductionRuntimePrimitiveEntry[] = [];
    onAdded = (entries) => { added = entries; };
    scene.addSubtree(node(primitives.box({ name: "f3 floor", material: material.pbr({ color: "#ffffff", texture: assets.wall }) }).runtime({ id: "f3-s-floor" })));
    const resource = added[0]!.resources[0]!;
    expect(resource.textureStatus).toBe("none");
    void run(added);
    expect(resource.textureStatus).toBe("pending");
    // A second pass (the mount pass still sweeping the shared list) never queues it twice.
    void run(scene.primitiveEntries);
    expect(resource.textureStatus).toBe("pending");
    // Native 5.0: the request identity is hashed before the fetch starts. Let this test's fetch start under its own
    // stub, so the still-pending job cannot reach the next test's fetch stub.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("the renderer runs the textured and custom-texture upgrades on the added entries", () => {
    // Native 5.0: added entries join the renderer's bounded texture job queue (scheduleAddedPrimitiveEntries ->
    // trackPrimitiveEntry -> enqueueTextureJob), and each drained job runs both the textured and custom upgrades.
    const src = readFileSync("packages/engine/src/agent-api/compiler/renderer.ts", "utf8");
    expect(src).toContain("onPrimitiveEntriesAdded: scheduleAddedPrimitiveEntries,");
    const schedule = src.slice(src.indexOf("const scheduleAddedPrimitiveEntries ="), src.indexOf("onPrimitiveEntriesAdded: scheduleAddedPrimitiveEntries,"));
    expect(schedule).toContain("trackPrimitiveEntry(entry, captured)");
    const drain = src.slice(src.indexOf("drainTextureJobs = (): void => {"), src.indexOf("const enqueueTextureJob ="));
    expect(drain).toContain("upgradeProductionPrimitiveTextures([oneEntry],");
    expect(drain).toContain("upgradeCustomMaterialTextures([oneEntry],");
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
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>((resolve) => { respond.push(resolve); }));
    const bitmaps: { width: number; height: number; close: ReturnType<typeof vi.fn> }[] = [];
    const warnings: string[] = [];
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => {
      const bitmap = { width: 1, height: 1, close: vi.fn() };
      bitmaps.push(bitmap);
      return bitmap;
    }));
    const scene = compiled();
    onAdded = (entries) => { void upgradeProductionPrimitiveTextures(entries, (message) => warnings.push(message)); };
    const box = (id: string) => node(primitives.box({ name: id, material: material.pbr({ texture: assets.wall }) }).runtime({ id }));
    // Native 5.0: the request identity is hashed before the fetch starts, so fetch starts are awaited.
    scene.addSubtree(box("removed"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(scene.removeSubtree("removed")).toBe(true);
    scene.addSubtree(box("replacement"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // Native 5.0: the removed primitive was the decode's only holder, so its transport is cancelled (4.7.x let it
    // decode and closed it on arrival). The replacement owns a fresh request and the only decoded image.
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    respond[0]!(new Response(Uint8Array.from(WALL_BYTES)));
    respond[1]!(new Response(Uint8Array.from(WALL_BYTES)));
    await vi.waitFor(() => expect(scene.primitiveEntries[0]!.resources[0]!.textureStatus).toBe("textured"));
    expect(bitmaps).toHaveLength(1);
    expect(bitmaps[0]!.close).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
    scene.dispose();
    expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1);
  });

  it("keeps a shared pending decode alive when only one of its primitive holders is removed", async () => {
    let respond: (value: Response) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; }));
    const bitmap = { width: 1, height: 1, close: vi.fn() };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    const scene = compiled();
    onAdded = (entries) => { void upgradeProductionPrimitiveTextures(entries, () => undefined); };
    const box = (id: string) => node(primitives.box({ name: id, material: material.pbr({ texture: assets.wall }) }).runtime({ id }));
    scene.addSubtree(box("first"));
    scene.addSubtree(box("second"));
    // Native 5.0: identity hashing is async; wait until the second holder has joined the first one's decode.
    await vi.waitFor(() => expect(sharedProductionTextureDecodeStats.hits).toBe(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(scene.removeSubtree("first")).toBe(true);
    respond(new Response(Uint8Array.from(WALL_BYTES)));
    await vi.waitFor(() => expect(scene.primitiveEntries[0]!.resources[0]!.textureStatus).toBe("textured"));
    expect(bitmap.close).not.toHaveBeenCalled();
    scene.dispose();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("releases a removed ready texture immediately and upgrades a later replacement in the next sweep", async () => {
    const maps = defineAuraAssets({
      floor0: { type: "texture", format: "png", url: "/scene-floor-0.png", hash: sha256("/scene-floor-0.png") },
      floor1: { type: "texture", format: "png", url: "/scene-floor-1.png", hash: sha256("/scene-floor-1.png") },
      floor2: { type: "texture", format: "png", url: "/scene-floor-2.png", hash: sha256("/scene-floor-2.png") },
      floor3: { type: "texture", format: "png", url: "/scene-floor-3.png", hash: sha256("/scene-floor-3.png") },
      decal: { type: "texture", format: "png", url: "/scene-decal.png", hash: sha256("/scene-decal.png") }
    });
    const openFloors: (() => void)[] = [];
    const fetchMock = vi.fn((url: string) => url.startsWith("/scene-floor-")
      ? new Promise<Response>((resolve) => { openFloors.push(() => resolve(new Response(url))); })
      : Promise.resolve(new Response(url)));
    const bitmaps: { url: string; width: number; height: number; close: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async (blob: Blob) => {
      const bitmap = { url: await blob.text(), width: 1, height: 1, close: vi.fn() };
      bitmaps.push(bitmap);
      return bitmap;
    }));
    const scene = compiled();
    const append = (id: string, map: (typeof maps)[keyof typeof maps]) =>
      scene.addSubtree(node(primitives.box({ name: id, material: material.pbr({ texture: map }) }).runtime({ id })));
    // Native 5.0: the 4.7.x look-ahead prefetch (822f9d071) is removed, so the decal must get one of the four
    // upgrade workers itself: three blocked floors (not four) leave a worker free. The removal and replacement
    // behavior under test is unchanged.
    [maps.floor0, maps.floor1, maps.floor2].forEach((map, i) => append(`floor-${i}`, map));
    append("removed-decal", maps.decal);
    const warnings: string[] = [];
    const done = upgradeProductionPrimitiveTextures(scene.primitiveEntries, (message) => warnings.push(message));
    try {
      await vi.waitFor(() => expect(bitmaps.filter(({ url }) => url === "/scene-decal.png")).toHaveLength(1));
      const old = bitmaps.find(({ url }) => url === "/scene-decal.png")!;
      const removed = scene.primitiveEntries.find((entry) => entry.node.name === "removed-decal")!.resources[0]!;
      await vi.waitFor(() => expect(removed.textureStatus).toBe("textured"));
      expect(removed.textureStage).toBe("done");
      expect(scene.removeSubtree("removed-decal")).toBe(true);
      expect(old.close).toHaveBeenCalledTimes(1);
      expect(scene.primitiveEntries.every((entry) => entry.resources[0]!.textureStatus === "pending")).toBe(true);
      append("replacement", maps.decal);
      const replacement = scene.primitiveEntries.find((entry) => entry.node.name === "replacement")!.resources[0]!;
      expect(replacement.textureStatus).toBe("none");
      for (const open of openFloors) open();
      await done;
      expect(replacement.textureStatus).toBe("textured");
      expect(fetchMock.mock.calls.filter(([url]) => url === "/scene-decal.png")).toHaveLength(2);
      const fresh = bitmaps.filter(({ url }) => url === "/scene-decal.png")[1]!;
      expect(fresh.close).not.toHaveBeenCalled();
      expect(warnings).toEqual([]);
      scene.dispose();
      expect(fresh.close).toHaveBeenCalledTimes(1);
      expect(old.close).toHaveBeenCalledTimes(1);
    } finally {
      for (const open of openFloors) open();
      await done;
      scene.dispose();
    }
  });

  it("upgrades and hides a primitive added through the runtime node registry", async () => {
    const bitmap = { width: 1, height: 1, close: vi.fn() };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from(WALL_BYTES))));
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    const snapshot = buildScene().toJSON();
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const scene = compiled();
    const upgrades: Promise<void>[] = [];
    onAdded = (entries) => { upgrades.push(upgradeProductionPrimitiveTextures(entries, () => undefined)); };
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
