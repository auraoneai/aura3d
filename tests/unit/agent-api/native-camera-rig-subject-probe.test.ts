import { afterEach, describe, expect, it } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { createAuraCameraController } from "../../../packages/engine/src/agent-api/camera/extension.js";
import { createCameraProbe } from "../../../packages/engine/src/agent-api/camera/Probe.js";
import { createChaseRig } from "../../../packages/engine/src/agent-api/camera/rigs/chase.js";
import { createFlightRig } from "../../../packages/engine/src/agent-api/camera/rigs/flight.js";
import { createOrbitRig } from "../../../packages/engine/src/agent-api/camera/rigs/orbit.js";
import { createShoulderRig } from "../../../packages/engine/src/agent-api/camera/rigs/shoulder.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createRuntimeNodeImportedAssetEvidence } from "../../../packages/engine/src/agent-api/runtimeEvidence.js";
import type { AuraApp, AuraRuntimeNodeHandle, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import type { AuraCameraPose, AuraCameraRig } from "../../../packages/engine/src/contracts/camera.js";

const asset = defineAuraAssets({
  hero: { type: "model", format: "glb", url: "/offline-hero.glb", bounds: [1.669, 1.788, 0.349] }
}).hero;
const registries: Array<ReturnType<typeof createAuraRuntimeNodeRegistry>> = [];

afterEach(() => {
  for (const registry of registries.splice(0)) registry.dispose();
});

function harness(snapshot: AuraSceneSnapshot, tier = "high") {
  const registry = createAuraRuntimeNodeRegistry(snapshot, { flags: resolveQrFlags({ options: ["game"], env: {} }) });
  registries.push(registry);
  const app = {
    scene: snapshot,
    nodes: registry,
    quality: { tier },
    canvas: { width: 1280, height: 720 },
    onFrame: () => () => {}
  } as unknown as AuraApp;
  return { registry, camera: createAuraCameraController(app) };
}

function heroScene(options: { id?: string; staticWall?: boolean; runtimeWall?: boolean } = {}) {
  const id = options.id ?? "hero";
  const builder = scene()
    .add(model(asset, { name: "certified hero humanoid-a" })
      .position(0, 0, 0).scale(1.62 / 1.788).runtime({ id, tags: ["player"] }))
    .camera(camera.perspective({ position: [0.55, 1.75, -2.8], target: [0, 1.35, 1.1], fov: 55 }));
  if (options.staticWall) {
    builder.add(primitives.box({ name: "wall", size: [8, 4, 0.2], position: [0, 1, -1] }));
  }
  if (options.runtimeWall) {
    builder.add(primitives.box({ name: "player", size: [8, 4, 0.2], position: [0, 1, -1] })
      .runtime({ id: "wall", tags: ["player"] }));
  }
  const result = harness(builder.toJSON());
  const hero = result.registry.require(id);
  // Loaded model bounds are published to the real handle by the renderer.
  // This grounded envelope reproduces the cast against the character's body
  // without loading a model or contacting a server in a camera unit test.
  hero.setImportedAssetEvidence(createRuntimeNodeImportedAssetEvidence({
    assetId: "hero",
    bounds: { position: [0, 0.81, 0], size: [1.516, 1.62, 0.316] }
  }));
  return { ...result, hero };
}

function run(cameraController: ReturnType<typeof createAuraCameraController>, frames = 120): AuraCameraPose {
  let pose = cameraController.presented();
  for (let frame = 0; frame < frames; frame += 1) {
    pose = cameraController.update(1 / 60, frame * 1000 / 60);
  }
  return pose;
}

function visibleFraction(pose: AuraCameraPose, handle: AuraRuntimeNodeHandle): number {
  const bounds = handle.bounds();
  const forward = pose.target.map((value, axis) => value - pose.position[axis]!);
  const length = Math.hypot(...forward);
  let visible = 0;
  let total = 0;
  for (let x = 0; x <= 8; x += 1) {
    for (let y = 0; y <= 8; y += 1) {
      for (let z = 0; z <= 8; z += 1) {
        const point = [x, y, z].map((step, axis) =>
          bounds.min[axis]! + (bounds.max[axis]! - bounds.min[axis]!) * step / 8
        );
        const depth = point.reduce((sum, value, axis) =>
          sum + (value - pose.position[axis]!) * forward[axis]! / length, 0
        );
        if (depth > pose.near) visible += 1;
        total += 1;
      }
    }
  }
  return visible / total;
}

describe("camera rig target collision identity", () => {
  it("reproduces the shoulder self-hit, then keeps the real controller outside the hero", () => {
    const { camera: controller, hero } = heroScene();
    const oldProbe = createCameraProbe({ bounds: () => [{ id: hero.id, ...hero.bounds() }] });
    const raw = oldProbe.sphereCast([0, 0.8525, 2.2], [-0.85, 1.55, -2.6], 0.2);
    expect(raw.node).toBe("hero");
    expect(raw.distance).toBeLessThan(3);

    controller.use(createShoulderRig({ target: "hero", collision: true }));
    const pose = run(controller);
    expect(pose.position[0]).toBeLessThan(-0.8);
    expect(pose.position[1]).toBeCloseTo(1.55, 1);
    expect(pose.position[2]).toBeLessThan(-2.3);
    expect(visibleFraction(pose, hero)).toBeGreaterThan(0.99);
    expect(controller.probe.stats().sphereCasts).toBe(1);
  });

  it.each(["id", "name", "tag", "handle"] as const)("resolves the current subject by %s", (kind) => {
    const { camera: controller, hero } = heroScene();
    const target = kind === "id" ? "hero" :
      kind === "name" ? "certified hero humanoid-a" : kind === "tag" ? "player" : hero;
    controller.use(createShoulderRig({ target, collision: true }));
    expect(run(controller).position[2]).toBeLessThan(-2.3);
  });

  it.each(["staticWall", "runtimeWall"] as const)("still collides with an external %s", (key) => {
    const { camera: controller } = heroScene({ [key]: true });
    // The runtime wall deliberately has the same name/tag as the target.
    controller.use(createShoulderRig({ target: "player", collision: true }));
    const pose = run(controller);
    expect(pose.position[2]).toBeGreaterThan(-0.75);
    expect(pose.position[2]).toBeLessThan(0);
  });

  it("re-resolves a tag when visibility changes instead of caching an old subject", () => {
    const { camera: controller, hero } = heroScene({ runtimeWall: true });
    controller.use(createShoulderRig({ target: "player", collision: true }));
    expect(run(controller).position[2]).toBeGreaterThan(-0.75);
    hero.setVisible(false); // the second visible "player" now wins
    expect(run(controller).position[2]).toBeLessThan(-3.3);
    hero.setVisible(true);
    expect(run(controller).position[2]).toBeGreaterThan(-0.75);
  });

  it("does not confuse a runtime id with the synthetic id of a static wall", () => {
    const { camera: controller } = heroScene({ id: "static:wall:1", staticWall: true });
    controller.use(createShoulderRig({ target: "static:wall:1", collision: true }));
    expect(run(controller).position[2]).toBeGreaterThan(-0.75);
  });

  it("counts a real static wall containing the cast origin", () => {
    const builder = scene()
      .add(primitives.box({ name: "enclosing wall", size: [2, 2, 2], position: [0, 1, 0] }))
      .camera(camera.perspective());
    const { camera: controller } = harness(builder.toJSON());
    controller.probe.beginFrame();
    expect(controller.probe.sphereCast([0, 1, 0], [0, 1, 4], 0.2))
      .toMatchObject({ hit: true, distance: 0, node: "static:enclosing wall:0" });
    controller.probe.beginFrame();
    expect(controller.probe.occluders([0, 1, 0], [0, 1, 4])).toEqual(["static:enclosing wall:0"]);
  });

  it("counts a wall touched by the expanded cast even when the origin is outside it", () => {
    const builder = scene()
      .add(primitives.box({ name: "near wall", size: [2, 2, 0.2], position: [0, 1, 0.25] }))
      .camera(camera.perspective());
    const { camera: controller } = harness(builder.toJSON());
    controller.probe.beginFrame();
    expect(controller.probe.sphereCast([0, 1, 0], [0, 1, 4], 0.2))
      .toMatchObject({ hit: true, distance: 0, node: "static:near wall:0" });
  });

  it("supports a uniquely mapped static target without ignoring the other static wall", () => {
    const builder = scene()
      .add(primitives.box({ name: "statue", size: [1.5, 1.6, 0.3], position: [0, 0, 0] }))
      .add(primitives.box({ name: "wall", size: [8, 4, 0.2], position: [0, 1, -1] }))
      .camera(camera.perspective());
    const { camera: controller } = harness(builder.toJSON());
    controller.use(createShoulderRig({ target: "statue", collision: true }));
    const pose = run(controller);
    expect(pose.position[2]).toBeGreaterThan(-0.75);
    expect(pose.position[2]).toBeLessThan(0);
  });

  it("rejects a resolved static target whose bounds cannot be mapped", () => {
    const builder = scene()
      .add(model(asset, { name: "unbounded", position: [0, 0, 0] }))
      .camera(camera.perspective());
    const { camera: controller } = harness(builder.toJSON());
    controller.use(createShoulderRig({ target: "unbounded", collision: true }));
    expect(() => controller.update(1 / 60, 0)).toThrow(/unbounded.*no mappable static bounds/);
  });

  it("rejects an instanced static target rather than hiding every instance", () => {
    const builder = scene()
      .add(primitives.box({
        name: "cluster", position: [0, 0, 0],
        instances: [{ position: [0, 0, 0] }, { position: [0, 0, -1] }]
      }))
      .camera(camera.perspective());
    const { camera: controller } = harness(builder.toJSON());
    controller.use(createShoulderRig({ target: "cluster", collision: true }));
    expect(() => controller.update(1 / 60, 0)).toThrow(/cluster.*instanced/);
  });

  it("does not keep a previous subject excluded after switching to a fixed-point rig", () => {
    const { camera: controller } = heroScene();
    controller.use(createShoulderRig({ target: "hero", collision: true }));
    expect(run(controller).position[2]).toBeLessThan(-2.3);
    controller.use(createOrbitRig({ target: [0, 0.81, 0], distance: 3, collision: true }));
    const pose = controller.update(1 / 60, 3000);
    expect(Math.hypot(...pose.position.map((value, axis) => value - pose.target[axis]!)))
      .toBeCloseTo(0.2, 6); // the hero is ordinary geometry for this rig
  });

  it("rejects a handle from a different app even when both apps use the same id", () => {
    const a = heroScene();
    const b = heroScene();
    b.camera.use(createShoulderRig({ target: a.hero, collision: true }));
    expect(() => b.camera.update(1 / 60, 0)).toThrow(/not a current handle of this app/);
    b.camera.use(createShoulderRig({ target: b.hero, collision: true }));
    expect(run(b.camera).position[2]).toBeLessThan(-2.3);
  });

  it("rebinds a shared rig's collision probe when alternating peer apps", () => {
    const a = heroScene();
    const b = heroScene({ staticWall: true });
    const rig = createShoulderRig({ target: "hero", collision: true });
    a.camera.use(rig);
    b.camera.use(rig);
    let clear: AuraCameraPose = a.camera.presented();
    let blocked: AuraCameraPose = b.camera.presented();
    for (let frame = 0; frame < 120; frame += 1) {
      clear = a.camera.update(1 / 60, frame * 1000 / 60);
      blocked = b.camera.update(1 / 60, frame * 1000 / 60);
    }
    expect(clear.position[2]).toBeCloseTo(-2.6, 3);
    expect(blocked.position[2]).toBeGreaterThan(-0.75);
  });

  it("only excludes the incoming subject during a crossfade", () => {
    const builder = scene()
      .add(primitives.box({ name: "first", size: [0.8, 1, 0.8], position: [0, 1, 0] }).runtime({ id: "first" }))
      .add(primitives.box({ name: "second", size: [0.8, 1, 0.8], position: [0, 1, -2], rotation: [0, Math.PI, 0] })
        .runtime({ id: "second" }))
      .camera(camera.perspective());
    const { camera: controller } = harness(builder.toJSON());
    const options = { distance: 5, height: 0, lookHeight: 0, collision: true } as const;
    controller.use(createChaseRig({ target: "first", ...options }));
    const first = run(controller, 10);
    expect(first.position[2]).toBeGreaterThan(-1.5); // second is an obstacle
    expect(first.position[2]).toBeLessThan(-0.5);

    const inner = createChaseRig({ target: "second", ...options });
    let incoming: AuraCameraPose | undefined;
    const recorded: AuraCameraRig = {
      id: "incoming",
      update(ctx) { return incoming = inner.update(ctx); }
    };
    controller.use(recorded, { blend: 2, ease: "linear" });
    controller.update(0.25, 500);
    expect(incoming).toBeDefined();
    expect(incoming!.position[2]).toBeLessThan(-0.5); // first remains an obstacle
    expect(incoming!.position[2]).toBeGreaterThan(-1.5);
    expect(controller.rig).toBe(recorded);
  });

  it.each([
    ["chase", (target: AuraRuntimeNodeHandle) => createChaseRig({ target, collision: true, lookHeight: 0, height: 0 })],
    ["flight", (target: AuraRuntimeNodeHandle) => createFlightRig({ target, collision: true, lookHeight: 0, height: 0 })],
    ["orbit", (target: AuraRuntimeNodeHandle) => createOrbitRig({ target, collision: true, pitch: 0 })]
  ] as const)("supports a handle target for the %s rig", (_name, rig) => {
    const { camera: controller, hero } = heroScene();
    controller.use(rig(hero));
    const pose = run(controller);
    const distance = Math.hypot(...pose.position.map((value, axis) => value - hero.position[axis]!));
    expect(distance).toBeGreaterThan(2);
    expect(controller.probe.stats().sphereCasts).toBe(1);
  });
});
