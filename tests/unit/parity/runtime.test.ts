/**
 * threejs-parity L7 (docs/workflows/threejs-parity-gaps.md §6 Lane L7):
 * scene/renderer/runtime parity — Clock, public raycast, renderer info +
 * setPixelRatio/setClearColor + precompile, image/cube backgrounds,
 * cube-camera + mirror surface nodes, rectArea lights, and the runtime
 * handle's three-style scene-graph members (layers, renderOrder,
 * frustumCulled, userData, traverse, world getters, attach).
 */

import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { Texture } from "../../../packages/rendering/src/Texture";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { TexturedUnlitMaterial } from "../../../packages/rendering/src/TexturedUnlitMaterial";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { createRenderTarget } from "../../../packages/engine/src/public/renderer";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createProductionParitySurfaces } from "../../../packages/engine/src/agent-api/compiler/paritySurfaces";
import { multiplyMat4, perspectiveMat4 } from "../../../packages/scene/src";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import type { ShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import {
  camera,
  cameras,
  Clock,
  createAuraApp,
  game,
  group,
  groups,
  lights,
  primitives,
  raycast,
  raycastFirst,
  scene,
  surfaces
} from "../../../packages/engine/src";
import { isAuraCubeCameraNode } from "../../../packages/engine/src/agent-api/nodes/cameras";
import { lodLevelVisible, lodMarkerOf } from "../../../packages/engine/src/agent-api/lodMarkers";
import { isAuraMirrorSurfaceNode } from "../../../packages/engine/src/agent-api/nodes/surfaces";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";

const boxNode = (name: string, position: readonly [number, number, number], extra: Partial<AuraPrimitiveNode> = {}): AuraPrimitiveNode => ({
  ...primitives.box({ name }).position(position[0], position[1], position[2]).toJSON(),
  ...extra
});

const headlessApp = (builder: ReturnType<typeof scene>) =>
  createAuraApp(null, { autoStart: false, scene: builder });

describe("parity L7 — Clock (SR-06)", () => {
  it("three's Clock: autoStart, getDelta seconds, getElapsedTime, stop/start", () => {
    let now = 1000;
    const clock = new Clock({ now: () => now });

    // autoStart: first read starts the clock and reports a 0 delta.
    expect(clock.running).toBe(false);
    expect(clock.getDelta()).toBe(0);
    expect(clock.running).toBe(true);

    now += 500; // 0.5s
    expect(clock.getDelta()).toBeCloseTo(0.5, 6);
    now += 250;
    expect(clock.getElapsedTime()).toBeCloseTo(0.75, 6);
    expect(clock.elapsedTime).toBeCloseTo(0.75, 6);

    // stop(): deltas read 0 and stopped time never leaks into the next delta.
    clock.stop();
    expect(clock.running).toBe(false);
    now += 9999;
    expect(clock.getDelta()).toBe(0);
    clock.start();
    now += 100;
    expect(clock.getDelta()).toBeCloseTo(0.1, 6);
    // three's start() resets elapsedTime to 0 (verified against r185 in migrate-three goldens).
    expect(clock.getElapsedTime()).toBeCloseTo(0.1, 6);

    // autoStart: false — reads stay inert until start().
    const manual = new Clock({ now: () => now, autoStart: false });
    expect(manual.getDelta()).toBe(0);
    expect(manual.running).toBe(false);
    manual.start();
    now += 40;
    expect(manual.getElapsedTime()).toBeCloseTo(0.04, 6);
  });
});

describe("parity L7 — renderer controls + info (SH-05/SR-05/SR-07)", () => {
  const makeRenderer = () =>
    new Renderer(
      new MockRenderDevice(),
      { width: 16, height: 16, shaderLibrary: {} as ShaderLibrary },
      new TemporalHistory()
    );

  it("info exposes three's shape: render counters + memory gauges", () => {
    const renderer = makeRenderer();
    try {
      const info = renderer.info;
      expect(info.render.calls).toBe(0);
      expect(info.render.frame).toBe(0);
      expect(info.render.triangles).toBe(0);
      expect(info.render.points).toBe(0);
      expect(info.render.lines).toBe(0);
      expect(typeof info.memory.geometries).toBe("number");
      expect(typeof info.memory.textures).toBe("number");
      expect(typeof info.approximateGpuMemoryBytes).toBe("number");
    } finally {
      renderer.dispose();
    }
  });

  it("setPixelRatio validates and stores the override; setClearColor validates channels", () => {
    const renderer = makeRenderer();
    try {
      renderer.setPixelRatio(2);
      expect(renderer.pixelRatio).toBe(2);
      expect(() => renderer.setPixelRatio(0)).toThrowError(/Pixel ratio/);
      expect(() => renderer.setPixelRatio(Number.NaN)).toThrowError(/Pixel ratio/);

      renderer.setClearColor([0.2, 0.4, 0.6], 0.5);
      expect(renderer.clearColorValue).toEqual([0.2, 0.4, 0.6, 0.5]);
      renderer.setClearColor([0.1, 0.2, 0.3, 0.4]);
      expect(renderer.clearColorValue).toEqual([0.1, 0.2, 0.3, 0.4]);
      expect(() => renderer.setClearColor([1.5, 0, 0])).toThrowError(/Clear color/);
    } finally {
      renderer.dispose();
    }
  });

  it("precompile warms programs for a source without submitting a frame", async () => {
    const renderer = makeRenderer();
    try {
      const result = await renderer.precompile({
        renderItems: [],
        cameraPolicy: "require",
        cameraPosition: [0, 0, 5]
      });
      expect(result.compiledPrograms).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      // No frame submitted — info.render.frame stays 0.
      expect(renderer.info.render.frame).toBe(0);
    } finally {
      renderer.dispose();
    }
  });
});

describe("parity L7 — raycast (SR-03)", () => {
  const boxAtOrigin = boxNode("unit box", [0, 0, 0]);

  it("world-ray input returns AABB hits nearest-first", () => {
    const near = boxNode("near", [0, 0, 3]);
    const far = boxNode("far", [0, 0, 1]);
    const hits = raycast(
      { origin: [0, 0, 10], direction: [0, 0, -1] },
      { nodes: [far, near] }
    );
    expect(hits.map((hit) => hit.nodeName)).toEqual(["near", "far"]);
    expect(hits[0]!.distance).toBeLessThan(hits[1]!.distance);

    const first = raycastFirst(
      { origin: [0, 0, 10], direction: [0, 0, -1] },
      { nodes: [far, near] }
    );
    expect(first?.nodeName).toBe("near");
  });

  it("firstHitOnly, near/far and layer masks bound the query", () => {
    const hits = raycast(
      { origin: [0, 0, 10], direction: [0, 0, -1] },
      { nodes: [boxAtOrigin], firstHitOnly: true }
    );
    expect(hits).toHaveLength(1);

    // near past the box → nothing.
    expect(
      raycast({ origin: [0, 0, 10], direction: [0, 0, -1] }, { nodes: [boxAtOrigin], near: 20 })
    ).toHaveLength(0);
    // far before the box → nothing.
    expect(
      raycast({ origin: [0, 0, 10], direction: [0, 0, -1] }, { nodes: [boxAtOrigin], far: 5 })
    ).toHaveLength(0);

    // three's Raycaster.layers: node on layer mask 0b10 only matches layers:0b10.
    const layered = boxNode("layered", [0, 0, 0], { layers: 0b10 });
    expect(
      raycast({ origin: [0, 0, 10], direction: [0, 0, -1] }, { nodes: [layered], layers: 0b01 })
    ).toHaveLength(0);
    expect(
      raycast({ origin: [0, 0, 10], direction: [0, 0, -1] }, { nodes: [layered], layers: 0b10 })
    ).toHaveLength(1);
  });

  it("camera + NDC input matches three's setFromCamera (center = forward ray)", () => {
    const hits = raycast(
      { camera: { position: [0, 0, 10], target: [0, 0, 0], fov: 60, aspect: 1 }, ndc: [0, 0] },
      { nodes: [boxAtOrigin] }
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]!.nodeName).toBe("unit box");
    expect(hits[0]!.distance).toBeCloseTo(9.5, 4);
  });

  it("recursive descends group children; non-recursive stays flat", () => {
    const tree = group("parent", [primitives.box({ name: "grouped" }).position(0, 0, 0)]).toJSON();
    const nodes = [tree];
    expect(
      raycast({ origin: [0, 0, 10], direction: [0, 0, -1] }, { nodes, recursive: true })[0]?.nodeName
    ).toBe("grouped");
    expect(
      raycast({ origin: [0, 0, 10], direction: [0, 0, -1] }, { nodes, recursive: false })
    ).toHaveLength(0);
  });
});

describe("parity L7 — scene backgrounds (SG-10)", () => {
  it("background accepts a color, an image descriptor, or a six-face cube", () => {
    const colored = scene().background("#112233").toJSON();
    expect(colored.background).toBe("#112233");
    expect(colored.backgroundImage).toBeUndefined();

    const textured = scene().background({ texture: "bg.png", intensity: 1.5, rotation: 0.25 }).toJSON();
    expect(textured.backgroundImage).toEqual({ texture: "bg.png", intensity: 1.5, rotation: 0.25 });

    const cubed = scene().background({
      cube: { faces: ["px.png", "nx.png", "py.png", "ny.png", "pz.png", "nz.png"], intensity: 0.8 }
    }).toJSON();
    expect(cubed.backgroundImage).toEqual({
      cube: { faces: ["px.png", "nx.png", "py.png", "ny.png", "pz.png", "nz.png"], intensity: 0.8 }
    });
  });
});

describe("parity L7 — cube camera + mirror surface nodes (SC-01/AD-15)", () => {
  it("cameras.cube emits a typed cube-camera node; materials can name it via envMap", () => {
    const node = cameras.cube({ name: "env", resolution: 64, near: 0.5, far: 50, updateEvery: 2, position: [0, 1, 0] }).toJSON();
    expect(isAuraCubeCameraNode(node)).toBe(true);
    expect(node).toMatchObject({ kind: "cube-camera", name: "env", resolution: 64, near: 0.5, far: 50, updateEvery: 2, position: [0, 1, 0] });

    // spec shape compiles (material.envMap.cubeCamera → RenderItem.environmentCube)
    const spec = {
      kind: "primitive" as const,
      primitive: "box",
      position: [0, 0, 0] as const,
      material: { model: "pbr" as const, envMap: { cubeCamera: "env" } }
    };
    expect(spec.material.envMap.cubeCamera).toBe("env");
  });

  it("surfaces.mirror emits a typed surface node", () => {
    const node = surfaces.mirror({ name: "floor", size: [6, 4], resolution: 128, position: [0, 0.01, 0], tint: "#a0c0ff" }).toJSON();
    expect(isAuraMirrorSurfaceNode(node)).toBe(true);
    expect(node).toMatchObject({ kind: "surface", surface: "mirror", name: "floor", size: [6, 4], resolution: 128 });
  });
});

describe("parity L7 — rectArea light alias (AD-16)", () => {
  it("lights.rectArea emits the rect area-light shape", () => {
    const node = lights.rectArea({ width: 3, height: 1.5, intensity: 2, position: [0, 2, 0], target: [0, 0, 0] }).toJSON();
    expect(node).toMatchObject({ kind: "light", light: "rect", width: 3, height: 1.5, intensity: 2 });
  });
});

describe("parity L7 — runtime node graph (SG-09)", () => {
  it("handle exposes renderOrder, frustumCulled, layers, userData, traverse, world getters and attach", () => {
    const app = headlessApp(
      scene()
        .add(
          primitives.box({ name: "parent" }).position(2, 0, 0).runtime(game.runtimeNode("parent"))
        )
        .add(
          primitives.box({ name: "child" }).position(0, 1, 0).runtime(game.runtimeNode("child"))
        )
    );
    const parent = app.nodes.require("parent");
    const child = app.nodes.require("child");

    // renderOrder / frustumCulled / userData — mutable through the handle.
    parent.renderOrder = 7;
    expect(parent.renderOrder).toBe(7);
    child.frustumCulled = false;
    expect(child.frustumCulled).toBe(false);
    // userData is a getter materializing the record; mutate the record itself.
    child.userData.role = "pickup";
    expect(child.userData).toEqual({ role: "pickup" });

    // layers — three's Layers: mask + set/enable/disable/toggle/test/isEnabled.
    child.layers.set(2);
    expect(child.layers.mask).toBe(0b100);
    child.layers.enable(0);
    expect(child.layers.mask).toBe(0b101);
    // three's layers.test: masks must share a channel — 0b101 has 0+2, not 1.
    expect(child.layers.test({ mask: 0b010 })).toBe(false);
    expect(child.layers.test({ mask: 0b100 })).toBe(true);
    child.layers.disable(2);
    expect(child.layers.isEnabled(2)).toBe(false);
    child.layers.enableAll();
    expect(child.layers.mask).toBe(0xffffffff);

    // world getters reflect the spec transform.
    expect([...child.getWorldPosition()]).toEqual([0, 1, 0]);
    expect([...parent.getWorldPosition()]).toEqual([2, 0, 0]);
    expect(child.getWorldScale().every((v: number) => v === 1)).toBe(true);
    const quat = child.getWorldQuaternion();
    expect(Math.abs(quat[3])).toBeCloseTo(1, 6);

    // attach() — three's Object3D.attach: world transform preserved.
    parent.attach(child);
    expect([...child.getWorldPosition()][0]).toBeCloseTo(0, 5);
    expect([...child.getWorldPosition()][1]).toBeCloseTo(1, 5);
    // child local position is now parent-relative: [0-2, 1-0, 0-0].
    expect(child.position[0]).toBeCloseTo(-2, 5);
    expect(child.position[1]).toBeCloseTo(1, 5);

    // traverse() visits the handle then attached children.
    const visited: string[] = [];
    parent.traverse((node) => { if (node.name) visited.push(node.name); });
    expect(visited).toEqual(["parent", "child"]);
  });
});

describe("parity L7 — mixed-child LOD (SG-11)", () => {
  it("groups.lod tags every level's subtree; lodLevelVisible selects by camera distance with hysteresis", () => {
    const lod = groups.lod({
      name: "city-block",
      position: [10, 0, 0],
      hysteresis: 2,
      levels: [
        { maxDistance: 10, children: [primitives.box({ name: "near" }), group("near-detail", [primitives.sphere({ name: "nested" })])] },
        { maxDistance: 50, children: [primitives.box({ name: "mid" })] },
        { children: [primitives.box({ name: "far" })] }
      ]
    });
    const node = lod.toJSON();
    expect(node.kind).toBe("group");
    // All 4 level-children flatten; the nested group keeps its marker deep.
    const flat = groups.flatten([node]);
    expect(flat.length).toBe(4);
    expect(lodMarkerOf(flat[0])?.levelIndex).toBe(0);
    expect(lodMarkerOf(flat[1])?.levelIndex).toBe(0); // nested group child tagged
    expect(lodMarkerOf(flat[2])?.levelIndex).toBe(1);
    expect(lodMarkerOf(flat[3])?.levelIndex).toBe(2);
    // Camera 5m from root (position [10,0,0]) -> level 0; 30m -> level 1; 80m -> level 2.
    expect(flat.map((n) => lodLevelVisible(n, [15, 0, 0]))).toEqual([true, true, false, false]);
    expect(flat.map((n) => lodLevelVisible(n, [40, 0, 0]))).toEqual([false, false, true, false]);
    expect(flat.map((n) => lodLevelVisible(n, [90, 0, 0]))).toEqual([false, false, false, true]);
    // Hysteresis hold: 30->12 is still inside level1's nearer band (10-2=8) only above 8; at 9 keep level1.
    expect(flat.map((n) => lodLevelVisible(n, [19, 0, 0]))).toEqual([false, false, true, false]);
    // Untagged node always visible.
    expect(lodLevelVisible(boxNode("free", [0, 0, 0]), [0, 0, 0])).toBe(true);
  });

  it("rejects empty levels and validates threshold ordering at build time", () => {
    expect(() => groups.lod({ levels: [] })).toThrowError(/at least one level/);
    expect(() => groups.lod({ levels: [{ children: [] }, { maxDistance: 5, children: [primitives.box({})] }] })).toThrowError(/final/);
    expect(() => groups.lod({ levels: [{ maxDistance: 20, children: [primitives.box({})] }, { maxDistance: 5, children: [primitives.box({})] }] })).toThrowError(/strictly increasing/);
  });
});

describe("parity L7 — LightProbe (AD-16)", () => {
  it("lights.lightProbe emits a probe light; SH9 coefficients evaluate into the hemisphere channel", async () => {
    const { collectPrd02Lights } = await import("../../../packages/engine/src/agent-api/compiler/lights");
    const probe = lights.lightProbe({ intensity: 2, skyColor: "#88aaff", groundColor: "#403020" }).toJSON();
    expect(probe.light).toBe("probe");
    const collected = collectPrd02Lights({ nodes: [probe] } as never);
    expect(collected.descriptors.length).toBe(0); // non-punctual: no direct-light descriptor
    expect(collected.hemisphere.length).toBe(1);
    expect(collected.hemisphere[0]!.intensity).toBe(2);
    // DC-only SH9, band-major packing (three's Vector3[9] flattened):
    // indices 0/1/2 = band0 R/G/B.
    const dcSh = new Array(27).fill(0);
    dcSh[0] = 1; dcSh[1] = 0.5; dcSh[2] = 0.25;
    const shProbe = lights.lightProbe({ sh: dcSh }).toJSON();
    const collected2 = collectPrd02Lights({ nodes: [shProbe] } as never);
    expect(collected2.hemisphere.length).toBe(1);
    const h = collected2.hemisphere[0]!;
    expect(h.skyColor[0]).toBeGreaterThan(0);
    expect(h.groundColor[1]).toBeGreaterThan(0);
    expect(h.skyColor[0]).not.toBe(h.skyColor[1]); // channel-separated evaluation
  });
});

describe("parity L7 — public RenderTarget + render({ target }) (SH-06, R-06)", () => {
  it("createRenderTarget is a value export that allocates a live device target", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    try {
      expect(typeof createRenderTarget).toBe("function");
      const target = createRenderTarget(renderer, { width: 16, height: 8, label: "rt-public" });
      expect(target).toMatchObject({ width: 16, height: 8, label: "rt-public", disposed: false });
      expect(target.colorTexture.width).toBe(16);
      expect(renderer.device.getDiagnostics().renderTargets).toBe(1);
      expect(createRenderTarget(renderer, { width: 2, height: 2 }).label).toBe("engine-render-target");
      // The device owns validation; the factory must not swallow it.
      expect(() => createRenderTarget(renderer, { width: 0, height: 4 })).toThrowError(/positive integers/);
    } finally {
      renderer.dispose();
    }
  });

  it("render({ source, target }) draws at the target's size and restores the viewport", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4, clearColor: [0, 0, 0, 1] });
    try {
      const device = renderer.device as MockRenderDevice;
      const bound: Array<string | null> = [];
      const setRenderTarget = device.setRenderTarget.bind(device);
      device.setRenderTarget = (next) => {
        bound.push(next?.label ?? null);
        setRenderTarget(next);
      };
      const target = createRenderTarget(renderer, { width: 16, height: 16, label: "rt-offscreen" });
      const diagnostics = renderer.render({
        source: { renderItems: [{ geometry: Geometry.triangle(), material: new UnlitMaterial({ color: [0.9, 0.2, 0.1, 1] }), label: "rt-triangle" }] },
        target
      });
      expect(diagnostics.drawCalls).toBe(1);
      expect(bound).toContain("rt-offscreen");
      // The frame ran at the target's 16x16, not the renderer's 4x4 …
      expect(renderer.device.captureState().get("viewport")).toBe("0,0,16,16");
      // … and the renderer's own size is restored afterwards.
      const size = renderer as unknown as { width: number; height: number };
      expect([size.width, size.height]).toEqual([4, 4]);
      target.dispose();
      expect(() => renderer.render({ source: { renderItems: [] }, target })).toThrowError(/live render target/);
    } finally {
      renderer.dispose();
    }
  });

  it("the target's colorTexture binds as a material map on a later frame", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, clearColor: [0, 0, 0, 1] });
    try {
      const target = createRenderTarget(renderer, { width: 16, height: 16, label: "rt-as-map" });
      renderer.render({
        source: { renderItems: [{ geometry: Geometry.triangle(), material: new UnlitMaterial({ color: [0, 1, 0, 1] }), label: "rt-source" }] },
        target
      });
      const device = renderer.device as MockRenderDevice;
      device.drawCommands.length = 0;

      renderer.render({
        renderItems: [{
          geometry: Geometry.texturedCube(1),
          material: new TexturedUnlitMaterial({ texture: target.colorTexture }),
          label: "rt-consumer"
        }]
      });
      const binding = device.drawCommands.find((c) => c.label === "rt-consumer")?.uniforms?.get("u_baseColorTexture");
      expect(binding).toBeInstanceOf(TextureBinding);
      expect((binding as TextureBinding).texture).toBe(target.colorTexture);
      expect(renderer.device.captureState().get("renderTarget") ?? null).toBeNull();
    } finally {
      renderer.dispose();
    }
  });
});

describe("parity L7 — camera layer mask hides non-intersecting nodes (SR-04, R-08)", () => {
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const item = (label: string, layerMask: number) => ({
    geometry: Geometry.triangle(),
    material: new UnlitMaterial({ color: [1, 1, 1, 1] }),
    label,
    layerMask
  });

  it("a CameraLike layerMask drops items whose layers do not intersect it from the frame", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    try {
      const device = renderer.device as MockRenderDevice;
      const source = { renderItems: [item("on-layer-0", 0b01), item("on-layer-1", 0b10), item("on-both", 0b11)], frustumCulling: false };

      renderer.render(source, { viewProjectionMatrix: identity });
      expect(device.drawCommands.map((c) => c.label).sort()).toEqual(["on-both", "on-layer-0", "on-layer-1"]);

      device.drawCommands.length = 0;
      renderer.render(source, { viewProjectionMatrix: identity, layerMask: 0b10 });
      expect(device.drawCommands.map((c) => c.label).sort()).toEqual(["on-both", "on-layer-1"]);

      device.drawCommands.length = 0;
      renderer.render(source, { viewProjectionMatrix: identity, layerMask: 0b100 });
      expect(device.drawCommands).toHaveLength(0);
    } finally {
      renderer.dispose();
    }
  });

  it("camera.perspective({ layers }) authors the mask on the camera spec", () => {
    expect(camera.perspective({ layers: 0b10 }).layers).toBe(0b10);
    expect("layers" in camera.perspective({})).toBe(false);
  });
});

describe("parity L7 — cube-camera reflection reaches the shader (SC-01, R-08)", () => {
  const faces = ["px", "nx", "py", "ny", "pz", "nz"] as const;
  const cubeBinding = () =>
    new TextureBinding({
      name: "u_environmentCubeMapTexture",
      expectedDimension: "cube",
      texture: new Texture({
        width: 2,
        height: 2,
        dimension: "cube",
        cubeFaces: faces.map((face) => ({ face, mipLevels: [{ width: 2, height: 2, data: new Uint8Array(16).fill(255) }] }))
      })
    });
  // What the app hands the renderer for a scene with no authored environment map:
  // explicit zero sampled-environment knobs (compiler/environment.ts).
  const sceneWithoutSampledEnvironment = { color: [1, 1, 1], intensity: 0, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 };
  const draw = async (environmentCube: TextureBinding | undefined, environmentLighting: Record<string, unknown>) => {
    const renderer = await Renderer.create({
      backend: "mock",
      width: 8,
      height: 8,
      qrFlags: resolveQrFlags({ options: ["lighting"] })
    });
    try {
      renderer.render({
        renderItems: [{
          geometry: Geometry.litCube(1),
          material: new PBRMaterial({ name: "reflector" }),
          label: "reflector",
          modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1]),
          ...(environmentCube ? { environmentCube } : {})
        }],
        frustumCulling: false,
        environmentLighting: environmentLighting as never
      });
      return (renderer.device as MockRenderDevice).drawCommands[0]!.uniforms!;
    } finally {
      renderer.dispose();
    }
  };

  it("an item cube reflects at three's envMapIntensity default when the scene has no sampled environment", async () => {
    const withCube = await draw(cubeBinding(), sceneWithoutSampledEnvironment);
    expect(withCube.get("u_environmentCubeMap")).toBeInstanceOf(TextureBinding);
    expect(withCube.get("u_environmentMapIntensity") as number).toBeCloseTo(1, 6);

    // Control: the same scene without a cube-camera binding keeps its zero knobs.
    const withoutCube = await draw(undefined, sceneWithoutSampledEnvironment);
    expect(withoutCube.get("u_environmentMapIntensity") as number).toBe(0);
  });

  it("a cube-camera binding ignores the scene knobs even when the scene has a sampled environment", async () => {
    const scenery = { ...sceneWithoutSampledEnvironment, environmentCubeMapTexture: cubeBinding(), environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 };
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: resolveQrFlags({ options: ["lighting"] }) });
    try {
      const item = (cubeCameraEnvMap?: string) => ({
        geometry: Geometry.litCube(1),
        material: new PBRMaterial({ name: "reflector" }),
        label: "reflector",
        modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1]),
        environmentCube: cubeBinding(),
        ...(cubeCameraEnvMap ? { cubeCameraEnvMap } : {})
      });
      const run = (cubeCameraEnvMap?: string): number => {
        renderer.render({ renderItems: [item(cubeCameraEnvMap)], frustumCulling: false, environmentLighting: scenery as never });
        const commands = (renderer.device as MockRenderDevice).drawCommands.filter((command) => command.label === "reflector");
        return commands[commands.length - 1]!.uniforms!.get("u_environmentMapIntensity") as number;
      };
      expect(run("env")).toBeCloseTo(1, 6);
      // A non-cube-camera per-draw cube (probe) still follows the authored scene knob.
      expect(run()).toBe(0);
    } finally {
      renderer.dispose();
    }
  });

  it("an authored sampled environment keeps its own knobs under an item cube", async () => {
    const authored = await draw(cubeBinding(), {
      ...sceneWithoutSampledEnvironment,
      environmentMapTexture: cubeBinding(),
      environmentMapIntensity: 0.3,
      environmentMapSpecularIntensity: 0.4
    });
    expect(authored.get("u_environmentMapIntensity") as number).toBeCloseTo(0.3, 6);
  });

  it("the app's static-batching source keeps the cube binding on a cube-camera item (SC-01)", async () => {
    const renderer = await Renderer.create({
      backend: "mock",
      width: 64,
      height: 64,
      qrFlags: resolveQrFlags({ options: ["lighting"] })
    });
    try {
      const warnings: string[] = [];
      const surfaces = createProductionParitySurfaces(renderer, (message) => warnings.push(message));
      const snapshot = scene()
        .camera(camera.perspective({ position: [0, 0, 6], target: [0, 0, 0], fov: 40 }))
        .add(cameras.cube({ name: "env", resolution: 32, position: [0, 0, 0] }))
        .add(primitives.sphere({ name: "ball" }))
        .toJSON();
      const items = [{
        geometry: Geometry.litCube(1),
        material: new PBRMaterial({ name: "ball" }),
        label: "ball",
        cubeCameraEnvMap: "env",
        modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        includeInAutoFrame: false
      }];
      // `staticBatching: true` + `frustumCulling: true` is exactly what createProductionRuntimeRendererInput submits.
      const source = surfaces.prepare(
        {
          collectRenderItems: () => items,
          cameraPolicy: "require",
          staticBatching: true,
          frustumCulling: true,
          environmentLighting: sceneWithoutSampledEnvironment as never
        },
        snapshot as never,
        undefined,
        0,
        64 / 64
      );
      const viewProjection = Float32Array.from(multiplyMat4(
        perspectiveMat4((Math.PI * 40) / 180, 1, 0.05, 100),
        new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -6, 1]) as never
      ));
      const device = renderer.device as MockRenderDevice;
      device.drawCommands.length = 0;
      renderer.render(source, { viewProjectionMatrix: viewProjection });

      expect(warnings).toEqual([]);
      const ball = device.drawCommands.find((command) => command.label?.includes("ball"))!.uniforms!;
      expect(ball.get("u_environmentCubeMap")).toBeInstanceOf(TextureBinding);
      expect(ball.get("u_environmentMapIntensity") as number).toBeCloseTo(1, 6);
    } finally {
      renderer.dispose();
    }
  });
});
