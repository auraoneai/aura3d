import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine";
import { BZ_MAP_KEYS, createFloorSurfaceLoader, nextSlotOf, placeholderId, withoutMaps } from "../../../apps/showcase-bunker-zero/src/art/floorLoad";

/**
 * GU47 g11 phase 10: only the boot floor's mapped surfaces mount with the scene; the other slots mount hidden map-free
 * placeholders and add their mapped surfaces when the floor is prepared (outcome banner) or, at the latest, started.
 */
const MAIN = readFileSync(path.resolve("apps/showcase-bunker-zero/src/main.ts"), "utf8");

describe("Bunker Zero per-floor surface load", () => {
  it("defers every slot but the boot slot and adds a slot's surfaces once, hiding them when it is not active", () => {
    const added: string[] = [];
    const after: [number, number][] = [];
    const loader = createFloorSurfaceLoader<string>(3, (b) => { added.push(b); }, (slot, n) => { after.push([slot, n]); });
    expect(() => loader.defer(3, "f3 walls")).toThrow(/boot slot/);
    loader.defer(4, "f4 walls");
    loader.defer(4, "f4 floor");
    loader.defer(6, "f6 walls");
    expect(added).toEqual([]);
    expect(loader.loaded()).toEqual([3]);
    expect(loader.prepare(4)).toBe(2);
    expect(loader.prepare(4)).toBe(0);
    expect(loader.prepare(3)).toBe(0);
    expect(added).toEqual(["f4 walls", "f4 floor"]);
    expect(after).toEqual([[4, 2]]);
    expect(loader.loaded()).toEqual([3, 4]);
  });

  it("hides partial additions and retries only the remaining surfaces after app.nodes.add throws", () => {
    const mounted = new Map<string, { visible: boolean }>([["f0-walls", { visible: true }]]);
    const attempts: string[] = [];
    const after: [number, number][] = [];
    let fail = true;
    const app = { nodes: { add(id: string) {
      attempts.push(id);
      if (id === "f1-floor" && fail) { fail = false; throw new Error("temporary add failure"); }
      mounted.set(id, { visible: true });
    } } };
    const loader = createFloorSurfaceLoader<string>(0, (id) => app.nodes.add(id), (slot, count) => {
      after.push([slot, count]);
      if (slot !== 0) for (const [id, handle] of mounted) if (id.startsWith(`f${slot}-`)) handle.visible = false;
    });
    for (const id of ["f1-walls", "f1-floor", "f1-ceil"]) loader.defer(1, id);
    expect(() => loader.prepare(1)).toThrow("temporary add failure");
    expect(loader.loaded()).toEqual([0]);
    expect(mounted.get("f0-walls")?.visible).toBe(true);
    expect(mounted.get("f1-walls")?.visible).toBe(false);
    expect(after).toEqual([[1, 1]]);
    expect(loader.prepare(1)).toBe(2);
    expect(loader.loaded()).toEqual([0, 1]);
    expect(attempts).toEqual(["f1-walls", "f1-floor", "f1-floor", "f1-ceil"]);
    expect([...mounted.values()].map((handle) => handle.visible)).toEqual([true, false, false, false]);
    expect(after).toEqual([[1, 1], [1, 2]]);
    expect(loader.prepare(1)).toBe(0);
  });

  it("retries the active floor after its first addition fails without hiding it", () => {
    const mounted = new Map<string, { visible: boolean }>();
    const after: [number, number][] = [];
    let fail = true;
    const loader = createFloorSurfaceLoader<string>(0, (id) => {
      if (fail) { fail = false; throw new Error("temporary add failure"); }
      mounted.set(id, { visible: true });
    }, (slot, count) => {
      after.push([slot, count]);
      if (slot !== 2) for (const handle of mounted.values()) handle.visible = false;
    });
    loader.defer(2, "f2-walls");
    const retry = nextSlotOf("retry", 2, 2, 6)!;
    expect(() => loader.prepare(retry)).toThrow("temporary add failure");
    expect(loader.loaded()).toEqual([0]);
    expect(after).toEqual([]);
    expect(loader.prepare(retry)).toBe(1);
    expect(mounted.get("f2-walls")?.visible).toBe(true);
    expect(loader.loaded()).toEqual([0, 2]);
    expect(after).toEqual([[2, 1]]);
    expect(loader.prepare(retry)).toBe(0);
  });

  it("keeps successful additions retryable if the visibility callback throws", () => {
    const added: string[] = [];
    const after: number[] = [];
    let fail = true;
    const loader = createFloorSurfaceLoader<string>(0, (id) => { added.push(id); }, (_slot, count) => {
      after.push(count);
      if (fail) { fail = false; throw new Error("visibility failure"); }
    });
    loader.defer(1, "f1-walls");
    expect(() => loader.prepare(1)).toThrow("visibility failure");
    expect(loader.loaded()).toEqual([0]);
    expect(loader.prepare(1)).toBe(0);
    expect(added).toEqual(["f1-walls"]);
    expect(after).toEqual([1, 0]);
    expect(loader.loaded()).toEqual([0, 1]);
  });

  it("marks a slot with no deferred surfaces loaded and invokes its callback once", () => {
    const after: [number, number][] = [];
    const loader = createFloorSurfaceLoader<string>(0, () => { throw new Error("unexpected addition"); }, (slot, count) => { after.push([slot, count]); });
    expect(loader.prepare(1)).toBe(0);
    expect(loader.prepare(1)).toBe(0);
    expect(loader.loaded()).toEqual([0, 1]);
    expect(after).toEqual([[1, 0]]);
  });

  it("placeholders keep the scalar look and drop every map binding", () => {
    const mapped = { color: "#5a5a5a", roughness: 0.88, metalness: 0, texture: "c", normal: "n", normalScale: 0.9, textureAnisotropy: 8, texTransforms: { baseColor: { scale: [2, 2] } } };
    const plain = withoutMaps(mapped);
    for (const key of BZ_MAP_KEYS) expect(plain).not.toHaveProperty(key);
    expect(plain).toEqual({ color: "#5a5a5a", roughness: 0.88, metalness: 0 });
    expect(mapped.texture).toBe("c");
    expect(placeholderId("f2-s-walls")).toBe("f2-s-walls-ph");
  });

  it("the next slot follows the pending outcome", () => {
    expect(nextSlotOf("next", 2, 2, 6)).toBe(3);
    expect(nextSlotOf("next", 5, 5, 6)).toBeNull();
    expect(nextSlotOf("retry", 4, 4, 6)).toBe(4);
    expect(nextSlotOf("retry", 0, 6, 6)).toBe(6);
    expect(nextSlotOf("killhouse-retry", 0, 6, 6)).toBe(6);
    expect(nextSlotOf("to-descent", 0, 6, 6)).toBe(0);
    expect(nextSlotOf("results", 5, 5, 6)).toBeNull();
  });

  it("main.ts routes every mapped static surface through the loader and prepares floors ahead and at start", () => {
    for (const key of ["walls", "accent", "floor", "ceil", "floor-alt", "columns"]) expect(MAIN).toContain(`mappedSurface(slot, "${key}"`);
    // none of them is mounted directly (the F6 hatch ceiling carries no maps and stays a plain static node)
    expect(MAIN).not.toMatch(/runtime\(staticNode\(slot, "(walls|accent|floor|columns|floor-alt)"\)\)/);
    expect(MAIN.match(/runtime\(staticNode\(slot, "ceil"\)\)/g)).toHaveLength(1);
    const start = MAIN.slice(MAIN.indexOf("function startFloor("), MAIN.indexOf("function hideAllRuntime("));
    expect(start.indexOf("SURFACES.prepare(activeSlot())")).toBeGreaterThan(-1);
    expect(start.indexOf("SURFACES.prepare(activeSlot())")).toBeLessThan(start.indexOf("hideAllRuntime()"));
    expect(MAIN).toMatch(/nextSlotOf\(pending\.kind, floorIdx, activeSlot\(\), FLOORS\.length\)/);
  });

  it("uses the original fully mounted surfaces when subtree compilation is disabled", () => {
    expect(resolveQrFlags({ options: ["game"], url: "https://example.test/?a3d-qr=-compiler" }).on("A3D_QR_COMPILER")).toBe(false);
    expect(resolveQrFlags({ options: ["game"], url: "https://example.test/" }).on("A3D_QR_COMPILER")).toBe(true);
    expect(MAIN).toMatch(/resolveQrFlags\(\{\s*options:\s*\["game"\],\s*url:\s*location\.href\s*\}\)\.on\("A3D_QR_COMPILER"\)/);
    expect(MAIN).toMatch(/slot === BOOT_SLOT \|\| !DEFER_FLOOR_SURFACES/);
  });

  it("waits for the renderer before preparing a floor selected during the initial mount", () => {
    const start = MAIN.slice(MAIN.indexOf("function startFloor("), MAIN.indexOf("function hideAllRuntime("));
    const ready = MAIN.slice(MAIN.indexOf("void mg.ready().then("));
    expect(start).toContain("if (appReady) SURFACES.prepare(activeSlot())");
    expect(ready.indexOf("SURFACES.prepare(activeSlot())")).toBeGreaterThan(ready.indexOf("appReady = true"));
    expect(ready.indexOf("SURFACES.prepare(activeSlot())")).toBeLessThan(ready.indexOf("hideAllRuntime()"));
  });
});
