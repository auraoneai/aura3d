/**
 * PRD-10 world frame passes against the pass declarations the real Renderer
 * makes (Renderer.ts render(): legacy ForwardPass "forward" writes `color`;
 * the A3D_QR_CORE_OUTPUT path writes `aura.scene.color.opaque`, then
 * `prd01.scene-depth-copy` → `aura.scene.depth.copy`, then the interleaved
 * transparent pass → `aura.scene.color`; the `background` phase runs only
 * with an environment background). Nothing writes `aura.scene.depth`.
 *
 * The older T0-33 regression faked an opaque pass that also wrote
 * `aura.scene.depth`/`aura.scene.color`, so it passed while every real
 * refracting-water frame, every `world`-without-`core` water frame and every
 * colour-background terrain frame either threw in compilePlan (frame loop
 * dies) or silently drew no terrain.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RenderGraph, ENVIRONMENT_BACKGROUND_COLOR_RESOURCE, type RenderPass } from "../../../../packages/rendering/src";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts";
import type { FrameContributor, FrameContributorContext } from "../../../../packages/rendering/src/contracts";
import { frameContributors } from "../../../../packages/rendering/src/contracts/frameGraph";
import { registerWorldFramePasses } from "../../../../packages/engine/src/production-runtime/world/WorldFramePasses";
import { worldTerrain } from "../../../../packages/engine/src/agent-api/world/terrain";
import { worldWater, clearWaterRecords } from "../../../../packages/engine/src/agent-api/world/water";

type Tier = "low" | "medium" | "high";
interface Variant { readonly core: boolean; readonly envBackground: boolean; readonly tier: Tier }

const writer = (name: string, reads: readonly string[], writes: readonly string[]): RenderPass => ({ name, reads, writes, execute() {} });

function flagsFor(core: boolean) {
  return resolveQrFlags({ options: core ? ["world", "core"] : ["world"], env: {} });
}

function ctx(v: Variant): FrameContributorContext {
  return {
    device: null, width: 1280, height: 720, frameIndex: 0, timeSeconds: 0, camera: null, source: null, items: [],
    tier: QUALITY_TIERS[v.tier] as FrameContributorContext["tier"],
    flags: flagsFor(v.core),
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false },
    blackboard: new Map()
  } as unknown as FrameContributorContext;
}

function contributor(v: Variant): FrameContributor {
  const con = frameContributors(flagsFor(v.core)).find((c) => c.id === "prd10.world");
  if (!con) throw new Error("prd10.world contributor not registered");
  return con;
}

/** Mirrors the pass declarations and phase order of Renderer.render(). */
function rendererGraph(v: Variant): RenderGraph {
  const graph = new RenderGraph();
  const c = ctx(v);
  const con = contributor(v);
  const add = (phase: Parameters<NonNullable<FrameContributor["passes"]>>[0]) => {
    for (const p of con.passes!(phase, c)) graph.addPass(p);
  };
  const bgRead = v.envBackground ? [ENVIRONMENT_BACKGROUND_COLOR_RESOURCE] : [];
  if (v.envBackground) {
    graph.addPass(writer("environment-background", [], [ENVIRONMENT_BACKGROUND_COLOR_RESOURCE]));
    add("background");
  }
  if (v.core) {
    graph.addPass(writer("prd01.opaque", bgRead, ["aura.scene.color.opaque"]));
    graph.addPass(writer("prd01.scene-depth-copy", [], ["aura.scene.depth.copy"]));
    add("after-opaque");
    add("transmission");
    add("transparent");
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
for (const core of [false, true]) for (const envBackground of [false, true]) for (const tier of ["low", "medium", "high"] as const) VARIANTS.push({ core, envBackground, tier });
const label = (v: Variant) => `core=${v.core} envBg=${v.envBackground} tier=${v.tier}`;

let dispose: (() => void) | null = null;

describe("prd10 world passes vs the real Renderer graph", () => {
  beforeEach(() => {
    dispose = registerWorldFramePasses();
  });
  afterEach(() => {
    clearWaterRecords();
    dispose?.();
    dispose = null;
  });

  it("terrain + refracting/planar water compiles in every renderer path and draws terrain exactly once", () => {
    worldTerrain({
      id: "graph-real-terrain",
      size: [8, 8],
      height: { kind: "array", columns: 2, rows: 2, heights: new Float32Array([0, 0.1, 0.1, 0.2]) },
      layers: [{ name: "grass" }],
      collider: false
    });
    worldWater({ id: "graph-real-water", kind: "lake", shape: { kind: "circle", center: [0, 0], radius: 5 }, waves: "calm" });
    for (const v of VARIANTS) {
      let names: string[] = [];
      expect(() => {
        names = rendererGraph(v).compilePlan().passes.map((p) => p.name);
      }, label(v)).not.toThrow();
      const terrain = names.filter((n) => n === "prd10.terrain" || n === "prd10.terrain.late");
      expect(terrain, label(v)).toHaveLength(1);
      expect(names, label(v)).toContain("prd10.water");
      // terrain must draw after the opaque forward pass or after the env background
      const opaque = names.indexOf(v.core ? "prd01.opaque" : "forward");
      if (!v.envBackground) expect(names.indexOf(terrain[0]!), label(v)).toBeGreaterThan(opaque);
      expect(names.indexOf("prd10.water"), label(v)).toBeGreaterThan(names.indexOf(terrain[0]!));
    }
  });
});
