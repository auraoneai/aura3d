import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionParitySurfaces } from "../../../packages/engine/src/agent-api/compiler/paritySurfaces";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { cameras } from "../../../packages/engine/src/agent-api/nodes/cameras";
import { group } from "../../../packages/engine/src/agent-api/nodes/groups";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { surfaces } from "../../../packages/engine/src/agent-api/nodes/surfaces";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer, type RenderSource } from "../../../packages/rendering/src/Renderer";

const SIZE = { width: 100, height: 50 };
const STEP = 1000 / 60;
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const FULL = rect(0, 0, 1, 1);
const SOURCE: RenderSource = { renderItems: [], cameraPolicy: "require", frustumCulling: false };
const array = (name: string, id = "main") => cameras.array({ name, cameras: [{ id, viewport: FULL }] });
const stereo = (name: string) => cameras.stereo({
  name, eyeSeparation: 0.2, focus: 6,
  views: [
    { id: "left", viewport: rect(0, 0, 0.75, 1), scissor: rect(0.1, 0.1, 0.5, 0.8), postprocess: false },
    { id: "right", viewport: rect(0.25, 0, 0.75, 1), camera: { layers: 4 } }
  ]
});

function snapshot(first = array("first"), second = stereo("second")): AuraSceneSnapshot {
  return scene().camera(camera.follow({ targetNode: "hero", offset: [0, 0, 5], smoothing: 0.5 }))
    .add(primitives.box({ name: "hero" }).runtime({ id: "hero" }))
    .add(first).add(second).toJSON();
}

async function fixture(initial = snapshot()) {
  const renderer = await Renderer.create({ backend: "mock", ...SIZE });
  const warnings: string[] = [];
  const parity = createProductionParitySurfaces(renderer, (value) => warnings.push(value));
  const registry = createAuraRuntimeNodeRegistry(initial);
  return {
    renderer, parity, registry, warnings,
    prepare(value: AuraSceneSnapshot, time = 0, size: { width: number; height: number } | undefined = SIZE) {
      return parity.prepare(SOURCE, value, registry, time, 2, size);
    },
    dispose() { parity.dispose(); registry.dispose(); renderer.dispose(); }
  };
}

describe("multiple authored camera groups", () => {
  it("preserves flattened scene order, view options and compositor ordering", async () => {
    const authored = scene().camera(camera.perspective({ position: [0, 0, 5] }))
      .add(stereo("stereo-first"))
      .add(group("nested", [array("nested-second")]))
      .add(array("third"))
      .toJSON();
    const f = await fixture(authored);
    try {
      const source = f.prepare(authored);
      expect(source.views!.map((view) => view.id)).toEqual([
        "stereo-first:id:left", "stereo-first:id:right", "nested-second:id:main", "third:id:main"
      ]);
      expect(source.views![0]).toMatchObject({
        viewport: rect(0, 0, 75, 50), scissor: rect(10, 5, 50, 40), postprocess: false
      });
      expect(source.views![1]!.camera.layerMask).toBe(4);
      expect(f.warnings).toEqual([]);
      f.renderer.render(source);
      const device = f.renderer.device as MockRenderDevice;
      expect(device.drawCommands.map((command) => command.label)).toEqual(Array(4).fill("renderer-view-composite"));
      expect(device.getDrawViewStates().map((state) => ({ viewport: state.viewport, scissor: state.scissor }))).toEqual(
        source.views!.map((view) => ({ viewport: view.viewport, scissor: view.scissor ?? view.viewport }))
      );
    } finally { f.dispose(); }
  });

  it("keeps stable IDs and independent follow histories through group reorder and removal", async () => {
    const f = await fixture();
    const both = snapshot();
    const reversed = snapshot(stereo("second"), array("first"));
    try {
      expect(f.prepare(both).views!.map((v) => v.cameraPosition![0])).toEqual([0, -0.1, 0.1]);
      f.registry.require("hero").setPosition(10, 0, 0);
      const moved = f.prepare(reversed, STEP).views!;
      expect(moved.map((v) => v.id)).toEqual(["second:id:left", "second:id:right", "first:id:main"]);
      expect(moved[0]!.cameraPosition![0]).toBeCloseTo(4.9);
      expect(moved[1]!.cameraPosition![0]).toBeCloseTo(5.1);
      expect(moved[2]!.cameraPosition![0]).toBeCloseTo(5);
      const firstOnly = scene().camera(both.camera).add(array("first")).toJSON();
      f.registry.require("hero").setPosition(20, 0, 0);
      f.prepare(firstOnly, 2 * STEP);
      f.registry.require("hero").setPosition(30, 0, 0);
      const restored = f.prepare(both, 3 * STEP).views!;
      expect(restored[0]!.cameraPosition![0]).toBeCloseTo(21.25);
      expect(restored[1]!.cameraPosition![0]).toBeCloseTo(29.9);
      expect(restored[2]!.cameraPosition![0]).toBeCloseTo(30.1);
    } finally { f.dispose(); }
  });

  it("does not commit previews or partial histories if a later group is invalid", async () => {
    const f = await fixture();
    const invalid = snapshot(array("first"), cameras.stereo({
      name: "second", views: [{}, { camera: { viewOffset: { fullWidth: 100, fullHeight: 100, x: 90, y: 0, width: 20, height: 100 } } }]
    }));
    try {
      f.prepare(snapshot());
      f.registry.require("hero").setPosition(10, 0, 0);
      expect(f.parity.prepareViews(snapshot(), f.registry, STEP, SIZE)).toHaveLength(3);
      expect(() => f.prepare(invalid, STEP)).toThrow(/view offset/i);
      f.registry.require("hero").setPosition(20, 0, 0);
      expect(f.prepare(snapshot(), STEP).views!.map((view) => view.cameraPosition![0])).toEqual([10, 9.9, 10.1]);
    } finally { f.dispose(); }
  });

  it("preflights later depth failures before captures even without dimensions", async () => {
    const authored = scene().camera(camera.perspective()).add(array("first"))
      // Reversed depth is native; a runtime zero-to-one clip range is still unsupported.
      .add(cameras.stereo({ name: "last", views: [{}, { camera: { depth: { mode: "reversed", clipRange: "zero-to-one" } as never } }] }))
      .add(cameras.cube({ resolution: 4 })).add(surfaces.mirror({ resolution: 4 })).toJSON();
    const f = await fixture(authored);
    const probe = vi.spyOn(f.renderer, "renderProbeFace");
    const render = vi.spyOn(f.renderer, "render");
    try {
      expect(() => f.prepare(authored)).toThrow(/CAMERA_STEREO_DEPTH_UNSUPPORTED/);
      expect(() => f.parity.prepareViews(authored, f.registry, 0)).toThrow(/CAMERA_STEREO_DEPTH_UNSUPPORTED/);
      expect(probe).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("rejects duplicate group names and ambiguous generated IDs before rendering", async () => {
    const f = await fixture();
    try {
      expect(() => f.prepare(snapshot(array("same"), stereo("same")))).toThrow(/CAMERA_VIEWS_GROUP_ID/);
      expect(() => f.prepare(snapshot(array("a", "x:id:y"), array("a:id:x", "y")))).toThrow(/CAMERA_VIEWS_ID_COLLISION/);
      expect(() => f.parity.prepareViews(snapshot(array("same"), stereo("same")), f.registry, 0)).toThrow(/CAMERA_VIEWS_GROUP_ID/);
    } finally { f.dispose(); }
  });

  it("enforces combined bounds and rejects an unsplittable stereo group", async () => {
    const f = await fixture();
    try {
      const manyGroups = scene().camera(camera.perspective());
      for (let i = 0; i < 17; i += 1) manyGroups.add(array(`group-${i}`));
      expect(() => f.prepare(manyGroups.toJSON())).toThrow(/CAMERA_VIEWS_LIMIT/);
      const manyViews = cameras.array({ name: "many", cameras: Array.from({ length: 32 }, (_, i) => ({ id: String(i), viewport: FULL })) });
      expect(() => f.prepare(snapshot(manyViews, array("extra")))).toThrow(/CAMERA_VIEWS_LIMIT/);
      expect(() => f.prepare(snapshot(), 0, { width: 1, height: 1 })).toThrow(/CAMERA_STEREO_TOO_SMALL/);
    } finally { f.dispose(); }
  });

  it("rejects existing source views rather than silently replacing them", async () => {
    const f = await fixture();
    try {
      const views = f.prepare(snapshot()).views!;
      expect(() => f.parity.prepare({ ...SOURCE, views }, snapshot(), f.registry, STEP, 2, SIZE)).toThrow(/CAMERA_VIEWS_SOURCE_CONFLICT/);
    } finally { f.dispose(); }
  });

  it("retires removed renderer targets and disposes parity history", async () => {
    const f = await fixture();
    try {
      f.renderer.render(f.prepare(snapshot()));
      const device = f.renderer.device as MockRenderDevice;
      expect(device.getDiagnostics().renderTargets).toBe(3);
      const only = scene().camera(snapshot().camera).add(array("first")).toJSON();
      f.renderer.render(f.prepare(only, STEP));
      expect(device.getDiagnostics().renderTargets).toBe(1);
      expect(device.getDiagnostics().disposedRenderTargets).toBeGreaterThanOrEqual(2);
      f.parity.dispose();
      expect(f.parity.prepareViews(snapshot(), f.registry, 2 * STEP, SIZE)).toBeUndefined();
    } finally { f.dispose(); }
  });
});
