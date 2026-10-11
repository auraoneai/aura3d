/**
 * T0-34 / #1111 — lane-07 frame passes against the pass declarations the real
 * Renderer makes (Renderer.ts render()): legacy ForwardPass "forward" writes
 * `color`; the A3D_QR_CORE_OUTPUT path writes `aura.scene.color.opaque`, then
 * `prd01.scene-depth-copy` → `aura.scene.depth.copy`, then the interleaved
 * transparent pass → `aura.scene.color`; the `background` phase runs only
 * after EnvironmentBackgroundPass. Nothing writes `aura.scene.depth`.
 *
 * Before the fix prd07.decals / prd07.volumetric read `aura.scene.depth`
 * ("reads …, but no pass writes it") and, with prd07.sky.background, wrote
 * `aura.scene.color` ("written by both" with the transparent pass), so any
 * vfx frame with decals, froxel fog or a sky background threw in compilePlan.
 */
import { describe, expect, it } from "vitest";
import { RenderGraph, ENVIRONMENT_BACKGROUND_COLOR_RESOURCE, type RenderPass } from "../../../../packages/rendering/src";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import "../../../../packages/rendering/src/lanes/prd07";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts";
import { FRAME_RESOURCES, frameContributors, type AuraFramePhase, type FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";

type Tier = "low" | "medium" | "high" | "ultra";
interface Variant { readonly core: boolean; readonly envBackground: boolean; readonly tier: Tier }

const VFX = ["vfx", "vfx.sky", "vfx.fog", "vfx.volumetric", "vfx.decals"];
const writer = (name: string, reads: readonly string[], writes: readonly string[]): RenderPass => ({ name, reads, writes, execute() {} });
const flagsFor = (core: boolean) => resolveQrFlags({ options: core ? [...VFX, "core"] : VFX, env: {} });
const device = new MockRenderDevice();
const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function ctx(v: Variant): FrameContributorContext {
  const blackboard = new Map<string, unknown>();
  // Lane 01 publishes the depth copy only on the v2 path (setSceneDepthCopy).
  if (v.core) blackboard.set(FRAME_RESOURCES.sceneDepthCopy, { width: 1280, height: 720 });
  return {
    device, width: 1280, height: 720, frameIndex: 0, timeSeconds: 0,
    camera: { position: [0, 2, 6], viewMatrix: identity(), projectionMatrix: identity(), viewProjectionMatrix: identity(), near: 0.1, far: 200 },
    source: {
      vfx: { decalFeed: () => ({ size: 1 }) },
      atmosphere: { sky: { model: "preetham", sun: { elevationDeg: 30, azimuthDeg: 120 } } }
    },
    items: [],
    tier: QUALITY_TIERS[v.tier] as FrameContributorContext["tier"],
    flags: flagsFor(v.core),
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 200, orthographic: false }, available: false },
    blackboard
  } as unknown as FrameContributorContext;
}

/** Mirrors the pass declarations and phase order of Renderer.render(). */
function rendererGraph(v: Variant): RenderGraph {
  const graph = new RenderGraph();
  const c = ctx(v);
  const lane = frameContributors(c.flags).filter((con) => con.owner === "prd07");
  const add = (phase: AuraFramePhase) => {
    for (const con of lane) if (con.phases.includes(phase)) for (const p of con.passes?.(phase, c) ?? []) graph.addPass(p);
  };
  const bgRead = v.envBackground ? [ENVIRONMENT_BACKGROUND_COLOR_RESOURCE] : [];
  if (v.envBackground) {
    graph.addPass(writer("environment-background", [], [ENVIRONMENT_BACKGROUND_COLOR_RESOURCE]));
    add("background");
  }
  if (v.core) {
    graph.addPass(writer("prd01.opaque", bgRead, ["aura.scene.color.opaque"]));
    graph.addPass(writer("prd01.scene-depth-copy", ["aura.scene.color.opaque"], ["aura.scene.depth.copy"]));
    add("after-opaque");
    add("transmission");
    graph.addPass(writer("prd01.transparent", ["aura.scene.color.opaque"], ["aura.scene.color"]));
  } else {
    graph.addPass(writer("forward", bgRead, ["color"]));
    add("after-opaque");
    add("transmission");
    add("transparent");
  }
  add("after-transparent");
  return graph;
}

const VARIANTS: Variant[] = [];
for (const core of [false, true]) for (const envBackground of [false, true]) for (const tier of ["low", "medium", "high", "ultra"] as const) VARIANTS.push({ core, envBackground, tier });
const label = (v: Variant) => `core=${v.core} envBg=${v.envBackground} tier=${v.tier}`;

describe("prd07 frame passes vs the real Renderer graph (T0-34, #1111)", () => {
  it("compiles in every renderer path × env background × tier", () => {
    for (const v of VARIANTS) {
      expect(() => rendererGraph(v).compilePlan(), label(v)).not.toThrow();
    }
  });

  it("emits decals in every path, volumetric only with a depth copy on froxel tiers, sky once per frame", () => {
    for (const v of VARIANTS) {
      const names = rendererGraph(v).compilePlan().passes.map((p) => p.name);
      const opaque = names.indexOf(v.core ? "prd01.opaque" : "forward");
      expect(names.indexOf("prd07.decals"), label(v)).toBeGreaterThan(opaque);
      const froxel = v.tier === "high" || v.tier === "ultra";
      expect(names.includes("prd07.volumetric"), label(v)).toBe(v.core && froxel);
      if (names.includes("prd07.volumetric")) expect(names.indexOf("prd07.volumetric"), label(v)).toBeGreaterThan(names.indexOf("prd01.scene-depth-copy"));
      // Sky draws exactly once: in `background` with an env background, else
      // depth-tested after opaque (colour-background scenes, S4/S5).
      expect(names.includes("prd07.sky.background"), label(v)).toBe(v.envBackground);
      expect(names.includes("prd07.sky.late"), label(v)).toBe(!v.envBackground);
      if (v.envBackground) expect(names.indexOf("prd07.sky.background"), label(v)).toBeLessThan(opaque);
      else expect(names.indexOf("prd07.sky.late"), label(v)).toBeGreaterThan(opaque);
      if (!v.envBackground && names.includes("prd07.volumetric")) expect(names.indexOf("prd07.volumetric"), label(v)).toBeGreaterThan(names.indexOf("prd07.sky.late"));
      if (v.core) expect(names.indexOf("prd07.decals"), label(v)).toBeLessThan(names.indexOf("prd01.transparent"));
    }
  });

  it("no lane-07 pass reads aura.scene.depth or writes aura.scene.color", () => {
    for (const v of VARIANTS) {
      for (const p of rendererGraph(v).compilePlan().passes.filter((x) => x.name.startsWith("prd07."))) {
        expect(p.reads, `${label(v)} ${p.name}`).not.toContain("aura.scene.depth");
        expect(p.writes, `${label(v)} ${p.name}`).not.toContain("aura.scene.color");
      }
    }
  });
});

describe("prd07 sky over a colour background (no environment background)", () => {
  it("draws after opaque, depth-tested less-equal so it fills only uncovered pixels", () => {
    const v: Variant = { core: true, envBackground: false, tier: "medium" };
    const late = rendererGraph(v).compilePlan().passes.find((p) => p.name === "prd07.sky.late");
    expect(late).toBeDefined();
    device.beginFrame(1280, 720);
    const before = device.drawCommands.length;
    late!.execute({ device, width: 1280, height: 720 } as never);
    device.endFrame();
    const draw = device.drawCommands[device.drawCommands.length - 1];
    expect(device.drawCommands.length).toBe(before + 1);
    expect(draw?.label).toBe("prd07.sky");
    expect(draw?.renderState).toMatchObject({ depthTest: true, depthWrite: false, depthCompare: "less-equal" });
  });

  it("the background-phase sky still draws without depth test", () => {
    const v: Variant = { core: true, envBackground: true, tier: "medium" };
    const bg = rendererGraph(v).compilePlan().passes.find((p) => p.name === "prd07.sky.background");
    device.beginFrame(1280, 720);
    bg!.execute({ device, width: 1280, height: 720 } as never);
    device.endFrame();
    const draw = device.drawCommands[device.drawCommands.length - 1];
    expect(draw?.renderState).toMatchObject({ depthTest: false, depthCompare: "always" });
  });
});
