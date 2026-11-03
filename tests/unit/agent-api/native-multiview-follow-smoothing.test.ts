import { describe, expect, it } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { resolveCameraFrame } from "../../../packages/engine/src/agent-api/compiler/camera";
import { createProductionParitySurfaces, type ProductionParitySurfaces } from "../../../packages/engine/src/agent-api/compiler/paritySurfaces";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { cameras, type AuraCameraArrayEntry } from "../../../packages/engine/src/agent-api/nodes/cameras";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraRuntimeNodeRegistry, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { Renderer, type RendererView } from "../../../packages/rendering/src/Renderer";

const STEP = 1000 / 60;
const SIZE = { width: 100, height: 50 };
const LEFT = { x: 0, y: 0, width: 0.5, height: 1 };
const RIGHT = { x: 0.5, y: 0, width: 0.5, height: 1 };
const SOURCE = { renderItems: [], cameraPolicy: "require" as const, frustumCulling: false };

type ViewNode = ReturnType<typeof cameras.array>;

/** Recreate authored nodes for each preparation so history cannot rely on node object identity. */
function makeSnapshot(view?: ViewNode, heroA = 0, heroB = 20): AuraSceneSnapshot {
  const builder = scene()
    .camera(camera.follow({ targetNode: "hero-a", offset: [0, 0, 5], smoothing: 0.5 }))
    .add(primitives.box({ name: "hero-a" }).position(heroA, 0, 0).runtime({ id: "hero-a" }))
    .add(primitives.box({ name: "hero-b" }).position(heroB, 0, 0).runtime({ id: "hero-b" }));
  if (view) builder.add(view);
  return builder.toJSON();
}

function makeArray(entries: readonly AuraCameraArrayEntry[], name = "follow-views"): ViewNode {
  return cameras.array({ name, cameras: entries });
}

function ordinaryArray(): ViewNode {
  return makeArray([{ id: "left", viewport: LEFT }, { id: "right", viewport: RIGHT }]);
}

function ordinaryStereo(): ViewNode {
  return cameras.stereo({
    name: "follow-views", eyeSeparation: 0.2, focus: 6,
    views: [{ id: "left" }, { id: "right" }]
  });
}

function prepare(
  surfaces: ProductionParitySurfaces,
  snapshot: AuraSceneSnapshot,
  registry: AuraRuntimeNodeRegistry | undefined,
  time: number
): readonly RendererView[] {
  const views = surfaces.prepare(SOURCE, snapshot, registry, time, 2, SIZE).views;
  expect(views).toBeDefined();
  return views!;
}

function eyeX(views: readonly RendererView[], index: number): number {
  const position = views[index]?.cameraPosition;
  expect(position).toBeDefined();
  return position![0];
}

async function fixture(view: ViewNode = ordinaryArray()) {
  const renderer = await Renderer.create({ backend: "mock", width: SIZE.width, height: SIZE.height });
  const warnings: string[] = [];
  const surfaces = createProductionParitySurfaces(renderer, (message) => warnings.push(message));
  const initialSnapshot = makeSnapshot(view);
  const registry = createAuraRuntimeNodeRegistry(initialSnapshot);
  return {
    renderer, warnings, surfaces, registry,
    moveA(x: number) { registry.require("hero-a").setPosition(x, 0, 0); },
    moveB(x: number) { registry.require("hero-b").setPosition(x, 0, 0); },
    dispose() { surfaces.dispose(); registry.dispose(); renderer.dispose(); }
  };
}

describe("array and stereo follow-camera smoothing", () => {
  it.each([
    { label: "array", make: ordinaryArray, leftOffset: 0, rightOffset: 0 },
    { label: "stereo", make: ordinaryStereo, leftOffset: -0.1, rightOffset: 0.1 }
  ])("smooths moving targets through successive $label preparations", async ({ make, leftOffset, rightOffset }) => {
    const f = await fixture(make());
    try {
      const initial = prepare(f.surfaces, makeSnapshot(make()), f.registry, 0);
      expect(eyeX(initial, 0)).toBeCloseTo(leftOffset, 6);
      expect(eyeX(initial, 1)).toBeCloseTo(rightOffset, 6);

      f.moveA(10);
      const next = prepare(f.surfaces, makeSnapshot(make()), f.registry, STEP);
      expect(eyeX(next, 0)).toBeCloseTo(5 + leftOffset, 6);
      expect(eyeX(next, 1)).toBeCloseTo(5 + rightOffset, 6);

      // Multiple consumers of one authored timestamp see one coherent frame.
      f.moveA(20);
      const again = prepare(f.surfaces, makeSnapshot(make()), f.registry, STEP);
      expect(eyeX(again, 0)).toBeCloseTo(5 + leftOffset, 6);
      expect(eyeX(again, 1)).toBeCloseTo(5 + rightOffset, 6);
      const later = prepare(f.surfaces, makeSnapshot(make()), f.registry, 2 * STEP);
      expect(eyeX(later, 0)).toBeCloseTo(12.5 + leftOffset, 6);
      expect(eyeX(later, 1)).toBeCloseTo(12.5 + rightOffset, 6);
      expect(f.warnings).toEqual([]);
    } finally { f.dispose(); }
  });

  it("keeps named view histories independent through reorder and reads the latest overrides", async () => {
    const left: AuraCameraArrayEntry = { id: "left", viewport: LEFT, camera: { targetNode: "hero-a", smoothing: 0.5 } };
    const right: AuraCameraArrayEntry = { id: "right", viewport: RIGHT, camera: { targetNode: "hero-b", smoothing: 0.75 } };
    const f = await fixture(makeArray([left, right]));
    try {
      prepare(f.surfaces, makeSnapshot(makeArray([left, right])), f.registry, 0);
      f.moveA(10); f.moveB(40);
      const reordered = prepare(f.surfaces, makeSnapshot(makeArray([right, left])), f.registry, STEP);
      expect(reordered.map((view) => view.id)).toEqual(["follow-views:id:right", "follow-views:id:left"]);
      expect(eyeX(reordered, 0)).toBeCloseTo(35, 6);
      expect(eyeX(reordered, 1)).toBeCloseTo(5, 6);

      f.moveA(20); f.moveB(60);
      const changedRight: AuraCameraArrayEntry = { ...right, camera: { targetNode: "hero-b", smoothing: 0.25 } };
      const changed = prepare(f.surfaces, makeSnapshot(makeArray([left, changedRight])), f.registry, 2 * STEP);
      expect(eyeX(changed, 0)).toBeCloseTo(12.5, 6);
      expect(eyeX(changed, 1)).toBeCloseTo(41.25, 6);
    } finally { f.dispose(); }
  });

  it("keeps prior poses when caller-owned camera tuples are mutated", async () => {
    const target: [number, number, number] = [0, 0, 0];
    const position: [number, number, number] = [0, 0, 5];
    const view = () => makeArray([{ id: "left", viewport: LEFT, camera: { targetNode: "missing", target, position } }]);
    const f = await fixture(view());
    try {
      prepare(f.surfaces, makeSnapshot(view()), f.registry, 0);
      target[0] = 10;
      position[0] = 10;
      expect(eyeX(prepare(f.surfaces, makeSnapshot(view()), f.registry, STEP), 0)).toBeCloseTo(5, 6);
    } finally { f.dispose(); }
  });

  it("uses positional identities for entries without explicit IDs", async () => {
    const slow: AuraCameraArrayEntry = { viewport: LEFT, camera: { smoothing: 0.5 } };
    const fast: AuraCameraArrayEntry = { viewport: RIGHT, camera: { smoothing: 0.75 } };
    const f = await fixture(makeArray([slow, fast]));
    try {
      prepare(f.surfaces, makeSnapshot(makeArray([slow, fast])), f.registry, 0);
      f.moveA(10);
      const first = prepare(f.surfaces, makeSnapshot(makeArray([slow, fast])), f.registry, STEP);
      expect(eyeX(first, 0)).toBeCloseTo(5, 6);
      expect(eyeX(first, 1)).toBeCloseTo(7.5, 6);
      f.moveA(20);
      const swapped = prepare(f.surfaces, makeSnapshot(makeArray([fast, slow])), f.registry, 2 * STEP);
      expect(swapped.map((view) => view.id)).toEqual(["follow-views:index:0", "follow-views:index:1"]);
      expect(eyeX(swapped, 0)).toBeCloseTo(16.25, 6);
      expect(eyeX(swapped, 1)).toBeCloseTo(13.75, 6);
    } finally { f.dispose(); }
  });

  it("isolates parity-surface owners that share one runtime registry", async () => {
    const f = await fixture();
    const other = createProductionParitySurfaces(f.renderer, () => {});
    try {
      const snapshot = makeSnapshot(ordinaryArray());
      prepare(f.surfaces, snapshot, f.registry, 0);
      f.moveA(10);
      expect(eyeX(prepare(f.surfaces, snapshot, f.registry, STEP), 0)).toBeCloseTo(5, 6);
      // The second owner has no prior frame, despite sharing registry and IDs.
      expect(eyeX(prepare(other, snapshot, f.registry, STEP), 0)).toBeCloseTo(10, 6);
      f.moveA(20);
      expect(eyeX(prepare(other, snapshot, f.registry, 2 * STEP), 0)).toBeCloseTo(15, 6);
      expect(eyeX(prepare(f.surfaces, snapshot, f.registry, 2 * STEP), 0)).toBeCloseTo(12.5, 6);
      f.surfaces.dispose();
      f.moveA(30);
      expect(eyeX(prepare(other, snapshot, f.registry, 3 * STEP), 0)).toBeCloseTo(22.5, 6);

      const remount = createProductionParitySurfaces(f.renderer, () => {});
      try { expect(eyeX(prepare(remount, snapshot, f.registry, 3 * STEP), 0)).toBeCloseTo(30, 6); }
      finally { remount.dispose(); }
    } finally { other.dispose(); f.dispose(); }
  });

  it("keeps two independent app registries separate even with identical view IDs", async () => {
    const f = await fixture();
    const other = createProductionParitySurfaces(f.renderer, () => {});
    const secondSnapshot = makeSnapshot(ordinaryArray());
    const secondRegistry = createAuraRuntimeNodeRegistry(secondSnapshot);
    try {
      prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 0);
      prepare(other, secondSnapshot, secondRegistry, 0);
      f.moveA(10);
      secondRegistry.require("hero-a").setPosition(20, 0, 0);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, STEP), 0)).toBeCloseTo(5, 6);
      expect(eyeX(prepare(other, secondSnapshot, secondRegistry, STEP), 0)).toBeCloseTo(10, 6);
    } finally { other.dispose(); secondRegistry.dispose(); f.dispose(); }
  });

  it("retires a removed view without discarding unchanged view history", async () => {
    const left: AuraCameraArrayEntry = { id: "left", viewport: LEFT, camera: { targetNode: "hero-a" } };
    const right: AuraCameraArrayEntry = { id: "right", viewport: RIGHT, camera: { targetNode: "hero-b" } };
    const f = await fixture(makeArray([left, right]));
    try {
      prepare(f.surfaces, makeSnapshot(makeArray([left, right])), f.registry, 0);
      f.moveA(10); f.moveB(40);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(makeArray([left])), f.registry, STEP), 0)).toBeCloseTo(5, 6);
      f.moveA(20); f.moveB(50);
      const restored = prepare(f.surfaces, makeSnapshot(makeArray([left, right])), f.registry, 2 * STEP);
      expect(eyeX(restored, 0)).toBeCloseTo(12.5, 6);
      expect(eyeX(restored, 1)).toBeCloseTo(50, 6);
    } finally { f.dispose(); }
  });

  it("retires all views when a successful frame has no multiview node", async () => {
    const f = await fixture();
    try {
      prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 0);
      f.moveA(10);
      expect(f.surfaces.prepare(SOURCE, makeSnapshot(), f.registry, STEP, 2, SIZE).views).toBeUndefined();
      f.moveA(20);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 2 * STEP), 0)).toBeCloseTo(20, 6);
    } finally { f.dispose(); }
  });

  it("does not advance or retire live state when previewing views", async () => {
    const f = await fixture();
    try {
      prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 0);
      f.moveA(10);
      expect(f.surfaces.prepareViews(makeSnapshot(ordinaryArray()), f.registry, STEP, SIZE)).toHaveLength(2);
      f.moveA(20);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, STEP), 0)).toBeCloseTo(10, 6);

      f.moveA(30);
      // Precompile may use the default time zero or a scene with no views.
      expect(f.surfaces.prepareViews(makeSnapshot(ordinaryArray()), f.registry, 0, SIZE)).toHaveLength(2);
      expect(f.surfaces.prepareViews(makeSnapshot(), f.registry, 2 * STEP, SIZE)).toBeUndefined();
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 2 * STEP), 0)).toBeCloseTo(20, 6);
    } finally { f.dispose(); }
  });

  it("does not commit the first view when the second projection is invalid", async () => {
    const f = await fixture();
    const invalid = makeArray([
      { id: "left", viewport: LEFT },
      { id: "right", viewport: RIGHT, camera: { viewOffset: { fullWidth: 100, fullHeight: 100, x: 90, y: 0, width: 20, height: 100 } } }
    ]);
    try {
      prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 0);
      f.moveA(10);
      expect(() => prepare(f.surfaces, makeSnapshot(invalid), f.registry, STEP)).toThrow(/view offset/i);
      f.moveA(20);
      const retry = prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, STEP);
      expect(eyeX(retry, 0)).toBeCloseTo(10, 6);
      expect(eyeX(retry, 1)).toBeCloseTo(10, 6);
    } finally { f.dispose(); }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("rejects non-finite follow smoothing (%s) without partial state", async (invalidSmoothing) => {
    const f = await fixture();
    const invalid = makeArray([
      { id: "left", viewport: LEFT },
      { id: "right", viewport: RIGHT, camera: { smoothing: invalidSmoothing } }
    ]);
    try {
      prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 0);
      f.moveA(10);
      expect(() => prepare(f.surfaces, makeSnapshot(invalid), f.registry, STEP)).toThrow(/CAMERA_SMOOTHING_INVALID/);
      f.moveA(20);
      const retry = prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, STEP);
      expect(eyeX(retry, 0)).toBeCloseTo(10, 6);
      expect(eyeX(retry, 1)).toBeCloseTo(10, 6);

      const snapshot = makeSnapshot(ordinaryArray());
      expect(() => resolveCameraFrame(snapshot, { ...snapshot.camera, smoothing: invalidSmoothing }, STEP)).toThrow(/CAMERA_SMOOTHING_INVALID/);
      expect(() => prepare(f.surfaces, makeSnapshot(invalid), undefined, 2 * STEP)).toThrow(/CAMERA_SMOOTHING_INVALID/);
    } finally { f.dispose(); }
  });

  it("resets on zero smoothing or leaving follow mode, and clamps other finite values", async () => {
    const follow = (smoothing: number): ViewNode => makeArray([{ id: "left", viewport: LEFT, camera: { smoothing } }]);
    const perspective = makeArray([{ id: "left", viewport: LEFT, camera: { mode: "perspective", position: [100, 0, 5] } }]);
    const f = await fixture(follow(0.5));
    try {
      prepare(f.surfaces, makeSnapshot(follow(0.5)), f.registry, 0);
      f.moveA(10);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(follow(0)), f.registry, STEP), 0)).toBeCloseTo(10, 6);
      f.moveA(20);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(follow(0.5)), f.registry, 2 * STEP), 0)).toBeCloseTo(20, 6);
      f.moveA(30);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(follow(2)), f.registry, 3 * STEP), 0)).toBeCloseTo(29.8, 6);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(perspective), f.registry, 4 * STEP), 0)).toBeCloseTo(100, 6);
      f.moveA(40);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(follow(0.5)), f.registry, 5 * STEP), 0)).toBeCloseTo(40, 6);
      f.moveA(50);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(follow(-1)), f.registry, 6 * STEP), 0)).toBeCloseTo(50, 6);
    } finally { f.dispose(); }
  });

  it("resets the affected view when its target name or live handle changes", async () => {
    const forTarget = (targetNode: string): ViewNode => makeArray([{ id: "left", viewport: LEFT, camera: { targetNode } }]);
    const f = await fixture(forTarget("hero-a"));
    try {
      prepare(f.surfaces, makeSnapshot(forTarget("hero-a")), f.registry, 0);
      f.moveA(10);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(forTarget("hero-a")), f.registry, STEP), 0)).toBeCloseTo(5, 6);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(forTarget("hero-b")), f.registry, 2 * STEP), 0)).toBeCloseTo(20, 6);
      f.moveB(40);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(forTarget("hero-b")), f.registry, 3 * STEP), 0)).toBeCloseTo(30, 6);

      const oldHandle = f.registry.require("hero-b");
      expect(f.registry.remove("hero-b")).toBe(true);
      const newHandle = f.registry.add(primitives.box({ name: "hero-b" }).position(100, 0, 0).runtime({ id: "hero-b" }));
      expect(newHandle).not.toBe(oldHandle);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(forTarget("hero-b")), f.registry, 4 * STEP), 0)).toBeCloseTo(100, 6);
    } finally { f.dispose(); }
  });

  it.each([
    { label: "name", target: "visible-subject" },
    { label: "tag", target: "subject-tag" }
  ])("keeps $label target history until the runtime handle is replaced", async ({ target }) => {
    const snapshot = scene()
      .camera(camera.follow({ targetNode: target, offset: [0, 0, 5], smoothing: 0.5 }))
      .add(primitives.box({ name: "visible-subject" }).runtime({ id: "subject-id", tags: ["subject-tag"] }))
      .add(ordinaryArray())
      .toJSON();
    const renderer = await Renderer.create({ backend: "mock", width: SIZE.width, height: SIZE.height });
    const surfaces = createProductionParitySurfaces(renderer, () => {});
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    try {
      prepare(surfaces, snapshot, registry, 0);
      const original = registry.require("subject-id");
      original.setPosition(10, 0, 0);
      const next = prepare(surfaces, snapshot, registry, STEP);
      expect(eyeX(next, 0)).toBeCloseTo(5, 6);
      expect(eyeX(next, 1)).toBeCloseTo(5, 6);

      expect(registry.remove("subject-id")).toBe(true);
      const replacement = registry.add(primitives.box({ name: "visible-subject" }).position(30, 0, 0).runtime({ id: "subject-id", tags: ["subject-tag"] }));
      expect(replacement).not.toBe(original);
      const reset = prepare(surfaces, snapshot, registry, 2 * STEP);
      expect(eyeX(reset, 0)).toBeCloseTo(30, 6);
      expect(eyeX(reset, 1)).toBeCloseTo(30, 6);
    } finally {
      surfaces.dispose();
      registry.dispose();
      renderer.dispose();
    }
  });

  it("does not smooth without a registry and resets when the registry changes", async () => {
    const f = await fixture();
    const otherRegistry = createAuraRuntimeNodeRegistry(makeSnapshot(ordinaryArray(), 100));
    try {
      prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 0);
      f.moveA(10);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray(), 10), undefined, STEP), 0)).toBeCloseTo(10, 6);
      f.moveA(20);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 2 * STEP), 0)).toBeCloseTo(20, 6);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray()), otherRegistry, 3 * STEP), 0)).toBeCloseTo(100, 6);
      f.moveA(30);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 4 * STEP), 0)).toBeCloseTo(30, 6);
    } finally { otherRegistry.dispose(); f.dispose(); }
  });

  it("preserves same-time reuse and snaps for backwards or long-gap timestamps", async () => {
    const f = await fixture();
    try {
      prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 100);
      f.moveA(10);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 100 + STEP), 0)).toBeCloseTo(5, 6);
      f.moveA(20);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 100 + STEP), 0)).toBeCloseTo(5, 6);
      f.moveA(30);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 95), 0)).toBeCloseTo(30, 6);
      f.moveA(40);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 400), 0)).toBeCloseTo(40, 6);
      f.moveA(50);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(ordinaryArray()), f.registry, 400 + STEP), 0)).toBeCloseTo(45, 6);
    } finally { f.dispose(); }
  });

  it("distinguishes node kind and structured name/ID components", async () => {
    const array = makeArray([{ id: "left", viewport: LEFT }], "follow-views");
    const stereo = ordinaryStereo();
    const f = await fixture(array);
    try {
      prepare(f.surfaces, makeSnapshot(array), f.registry, 0);
      f.moveA(10);
      expect(eyeX(prepare(f.surfaces, makeSnapshot(stereo), f.registry, STEP), 0)).toBeCloseTo(9.9, 6);

      // These two components produce the same display ID when concatenated
      // with separators, but denote different authored nodes and views.
      const first = makeArray([{ id: "b", viewport: LEFT }], "split:id:a");
      const second = makeArray([{ id: "a:id:b", viewport: LEFT }], "split");
      f.moveA(20);
      const one = prepare(f.surfaces, makeSnapshot(first), f.registry, 2 * STEP);
      f.moveA(30);
      const two = prepare(f.surfaces, makeSnapshot(second), f.registry, 3 * STEP);
      expect(one[0]!.id).toBe(two[0]!.id);
      expect(eyeX(two, 0)).toBeCloseTo(30, 6);
    } finally { f.dispose(); }
  });
});
